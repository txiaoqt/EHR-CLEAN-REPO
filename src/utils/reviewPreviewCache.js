import { supabase } from '../supabaseClient.js';

const MAX_CACHED_FILES = 3;
const LINK_LIFETIME_SECONDS = 3600;
let pdfModulePromise;

const loadPdfJs = () => {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    }).catch((error) => {
      pdfModulePromise = null;
      throw error;
    });
  }
  return pdfModulePromise;
};

export const reviewFileKey = (file) => file
  ? JSON.stringify([file.id, file.storage_path, file.submitted_at, file.size_bytes])
  : '';

const fileKind = (file) => {
  if (file.mime_type === 'application/pdf' || /\.pdf$/i.test(file.file_name)) return 'pdf';
  if (file.mime_type?.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.file_name)) return 'image';
  return 'other';
};

/** Private, bounded cache owned by one applicant review; nothing is persisted. */
export const createReviewPreviewCache = () => {
  const links = new Map();
  const files = new Map();
  let catalogue = [];
  let activeKey = '';
  let disposed = false;
  let disposeTimer;
  let warming = false;
  let owners = 0;

  const closedError = () => new DOMException('The document review was closed.', 'AbortError');
  const releaseFile = (entry) => {
    entry.controller.abort();
    entry.renderTask?.cancel();
    if (entry.loadingTask) void entry.loadingTask.destroy().catch(() => {});
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
    if (entry.canvas) entry.canvas.width = entry.canvas.height = 0;
    entry.canvas = null;
  };

  const prepareLinks = (documents) => {
    if (disposed) return Promise.resolve();
    const missing = documents.filter((file) => {
      const link = links.get(reviewFileKey(file));
      return file.storage_path && !link?.pending && (!link || link.expiresAt <= Date.now());
    });

    if (missing.length) {
      const expiresAt = Date.now() + (LINK_LIFETIME_SECONDS - 30) * 1000;
      const pending = (async () => {
        try {
          const paths = [...new Set(missing.map((file) => file.storage_path))];
          const { data, error } = await supabase.storage.from('enrollee-documents')
            .createSignedUrls(paths, LINK_LIFETIME_SECONDS);
          if (error) throw error;
          if (disposed) return;
          const byPath = new Map((data || []).map((link) => [link.path, link]));
          for (const file of missing) {
            if (links.get(reviewFileKey(file))?.pending !== pending) continue;
            const link = byPath.get(file.storage_path);
            links.set(reviewFileKey(file), {
              url: link?.signedUrl || '', expiresAt,
              error: link?.signedUrl ? '' : 'The secure file link could not be created. Try again.',
            });
          }
        } catch (error) {
          if (disposed) return;
          for (const file of missing) {
            if (links.get(reviewFileKey(file))?.pending !== pending) continue;
            links.set(reviewFileKey(file), {
              url: '', expiresAt,
              error: error.message || 'The secure file link could not be created. Try again.',
            });
          }
        }
      })();
      for (const file of missing) links.set(reviewFileKey(file), { pending, expiresAt });
    }

    return Promise.all([...new Set(documents.map((file) => links.get(reviewFileKey(file))?.pending).filter(Boolean))]);
  };

  const cache = {
    viewerWidth: 0,
    retain() {
      owners += 1;
      clearTimeout(disposeTimer);
      return () => {
        owners -= 1;
        // StrictMode's immediate effect replay reuses the same in-flight work.
        disposeTimer = setTimeout(() => {
          if (owners > 0) return;
          disposed = true;
          for (const entry of files.values()) releaseFile(entry);
          files.clear();
          links.clear();
          catalogue = [];
        }, 0);
      };
    },
    setDocuments(documents) {
      if (disposed) return;
      catalogue = documents;
      const keys = new Set(documents.map(reviewFileKey));
      for (const [key, entry] of files) {
        if (!keys.has(key)) { releaseFile(entry); files.delete(key); }
      }
      for (const key of links.keys()) if (!keys.has(key)) links.delete(key);
      if (documents.some((file) => fileKind(file) === 'pdf')) void loadPdfJs().catch(() => {});
      void prepareLinks(documents);
    },
    peek(file) { return files.get(reviewFileKey(file)); },
    source(file) { return links.get(reviewFileKey(file))?.url || ''; },
    activate(file) { activeKey = reviewFileKey(file); },
    retry(file) {
      const key = reviewFileKey(file);
      if (files.has(key)) releaseFile(files.get(key));
      files.delete(key);
      links.delete(key);
    },
    load(file, background = false) {
      if (disposed) return Promise.reject(closedError());
      const key = reviewFileKey(file);
      if (files.has(key)) {
        const entry = files.get(key);
        files.delete(key);
        files.set(key, entry);
        // Renew expired links independently of the already downloaded file.
        return prepareLinks([file]).then(async () => {
          const resource = await entry.promise;
          resource.url = links.get(key)?.url || '';
          return resource;
        });
      }

      while (files.size >= MAX_CACHED_FILES) {
        const oldest = [...files.keys()].find((candidate) => candidate !== activeKey);
        if (!oldest) break;
        releaseFile(files.get(oldest));
        files.delete(oldest);
      }

      const entry = { key, kind: fileKind(file), controller: new AbortController(), pageNumber: 1 };
      files.set(key, entry);
      entry.promise = (async () => {
        await prepareLinks([file]);
        if (disposed || entry.controller.signal.aborted) throw closedError();
        const link = links.get(key);
        if (!link?.url) throw new Error(link?.error || 'The file has no preview link.');
        entry.url = link.url;
        if (entry.kind !== 'other') {
          // Library loading and the single file download can run together.
          const [response, pdfjs] = await Promise.all([
            fetch(entry.url, { signal: entry.controller.signal, priority: background ? 'low' : 'high' }),
            entry.kind === 'pdf' ? loadPdfJs() : Promise.resolve(null),
          ]);
          if (!response.ok) throw new Error('The file could not be downloaded. Try again.');
          if (entry.kind === 'pdf') {
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (disposed || entry.controller.signal.aborted) throw closedError();
            entry.loadingTask = pdfjs.getDocument({ data: bytes });
            entry.pdf = await entry.loadingTask.promise;
          } else {
            const blob = await response.blob();
            if (disposed || entry.controller.signal.aborted) throw closedError();
            entry.objectUrl = URL.createObjectURL(blob);
          }
        }
        if (disposed || entry.controller.signal.aborted) throw closedError();
        entry.ready = true;
        return entry;
      })();
      return entry.promise;
    },
    async warm() {
      if (warming || disposed || navigator.connection?.saveData) return;
      warming = true;
      const selectedKey = activeKey;
      const index = catalogue.findIndex((file) => reviewFileKey(file) === selectedKey);
      const neighbours = [...catalogue.slice(index + 1), ...catalogue.slice(0, Math.max(0, index))];
      try {
        // Warm at most two neighbours, serially, after the visible page is ready.
        for (const file of neighbours) {
          if (disposed || activeKey !== selectedKey || files.size >= MAX_CACHED_FILES) break;
          if (files.has(reviewFileKey(file)) || fileKind(file) === 'other') continue;
          try { await cache.load(file, true); } catch (_) { /* Selecting it exposes retry. */ }
        }
      } finally {
        warming = false;
      }
    },
  };
  return cache;
};
