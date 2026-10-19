import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons/Icons.jsx';
import { reviewFileKey } from '../utils/reviewPreviewCache.js';

const MAX_PAGE_WIDTH = 840;
const MAX_RENDER_SCALE = 2;

const PdfPage = ({ entry, pageNumber, availableWidth, onReady, onBusy, onError }) => {
  const hostRef = useRef(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!entry.pdf || !host || availableWidth <= 0) return undefined;
    const targetWidth = Math.max(1, Math.min(MAX_PAGE_WIDTH, availableWidth - 34));
    const outputScale = Math.max(1, Math.min(window.devicePixelRatio || 1, MAX_RENDER_SCALE));
    const renderKey = `${pageNumber}:${targetWidth}:${outputScale}`;

    // Reattach the finished canvas when returning to a recently opened file.
    if (entry.canvas && entry.renderKey === renderKey) {
      host.replaceChildren(entry.canvas);
      onReady();
      return () => { if (entry.canvas?.parentNode === host) host.removeChild(entry.canvas); };
    }

    let cancelled = false;
    let renderTask;
    onBusy();
    const render = async () => {
      try {
        const page = await entry.pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: targetWidth / page.getViewport({ scale: 1 }).width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.setAttribute('aria-label', `PDF page ${pageNumber}`);
        const context = canvas.getContext('2d', { alpha: false });
        host.replaceChildren(canvas);

        renderTask = page.render({
          canvasContext: context, viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        });
        entry.renderTask = renderTask;
        await renderTask.promise;
        if (cancelled) return;
        // Keep one rendered page per cached file to bound canvas memory.
        if (entry.canvas && entry.canvas !== canvas) entry.canvas.width = entry.canvas.height = 0;
        entry.canvas = canvas;
        entry.renderKey = renderKey;
        onReady();
      } catch (error) {
        if (!cancelled && error?.name !== 'RenderingCancelledException') {
          onError('This PDF page could not be rendered. Try again or open the original file.');
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      if (entry.renderTask === renderTask) entry.renderTask = null;
      if (entry.canvas?.parentNode === host) host.removeChild(entry.canvas);
    };
  }, [availableWidth, entry, onBusy, onError, onReady, pageNumber]);

  return <figure className="enrollee-review-pdf-page"><div className="enrollee-review-pdf-canvas-wrap" ref={hostRef} /></figure>;
};

const PdfJsDocumentPreview = ({ document: submission, cache, onSourceReady }) => {
  const pagesRef = useRef(null);
  const fileKey = reviewFileKey(submission);
  const cached = cache.peek(submission);
  const [entry, setEntry] = useState(() => cached?.ready ? cached : null);
  const [availableWidth, setAvailableWidth] = useState(cache.viewerWidth);
  const [pageNumber, setPageNumber] = useState(cached?.pageNumber || 1);
  const [loading, setLoading] = useState(!cached?.ready);
  const [rendering, setRendering] = useState(!cached?.canvas && !cached?.imageReady);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const content = pagesRef.current;
    if (!content) return undefined;
    const measure = () => {
      const width = content.clientWidth;
      if (width > 0) {
        cache.viewerWidth = width;
        setAvailableWidth(width);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [cache]);

  useEffect(() => {
    let active = true;
    cache.activate(submission);
    const ready = cache.peek(submission);
    setError('');
    if (!ready?.ready) { setLoading(true); setEntry(null); setRendering(true); }

    void cache.load(submission).then((resource) => {
      if (!active) return;
      setEntry(resource);
      setPageNumber(resource.pageNumber);
      setLoading(false);
      onSourceReady({ key: fileKey, url: resource.url });
    }).catch((failure) => {
      if (!active || failure?.name === 'AbortError') return;
      setLoading(false);
      setRendering(false);
      setError(failure.message || 'The file preview could not be loaded. Try again.');
      onSourceReady({ key: fileKey, url: cache.source(submission) });
    });
    return () => { active = false; };
  }, [attempt, cache, fileKey, onSourceReady]);

  const markReady = useCallback(() => {
    setRendering(false);
    void cache.warm();
  }, [cache]);
  const markBusy = useCallback(() => setRendering(true), []);
  const markError = useCallback((message) => { setRendering(false); setError(message); }, []);

  const changePage = (next) => {
    entry.pageNumber = next;
    setRendering(true);
    setPageNumber(next);
    if (pagesRef.current) pagesRef.current.scrollTop = 0;
  };
  const retry = () => {
    cache.retry(submission);
    setEntry(null);
    setError('');
    setLoading(true);
    setRendering(true);
    setAttempt((value) => value + 1);
  };
  const busy = !error && (loading || (entry?.kind !== 'other' && rendering));

  return (
    <div className="enrollee-review-pdf-viewport" aria-label={`File preview: ${submission.file_name}`} aria-busy={busy}>
      {entry?.kind === 'pdf' && (
        <nav className="enrollee-review-pdf-pagination" aria-label="PDF pages">
          <span role="status" aria-live="polite">Page {pageNumber} of {entry.pdf.numPages}</span>
          {entry.pdf.numPages > 1 && (
            <div className="enrollee-review-pdf-page-controls">
              <button type="button" className="btn secondary small" aria-label="Previous PDF page" disabled={pageNumber <= 1} onClick={() => changePage(pageNumber - 1)}><ChevronLeftIcon size={16} /></button>
              <button type="button" className="btn secondary small" aria-label="Next PDF page" disabled={pageNumber >= entry.pdf.numPages} onClick={() => changePage(pageNumber + 1)}><ChevronRightIcon size={16} /></button>
            </div>
          )}
        </nav>
      )}
      <div className="enrollee-review-file-content" ref={pagesRef} tabIndex={0} aria-label="Preview content">
        {entry?.kind === 'pdf' && !error && availableWidth > 0 && (
          <div className="enrollee-review-pdf-pages" data-rendering={rendering}>
            <PdfPage entry={entry} pageNumber={pageNumber} availableWidth={availableWidth} onReady={markReady} onBusy={markBusy} onError={markError} />
          </div>
        )}
        {entry?.kind === 'image' && !error && (
          <img className="enrollee-review-image" src={entry.objectUrl} alt={`Preview of ${submission.file_name}`}
            onLoad={() => { entry.imageReady = true; markReady(); }}
            onError={() => markError('The image preview could not be loaded. Try again or open the original file.')} />
        )}
        {entry?.kind === 'other' && <div className="enrollee-review-preview-message">This file type cannot be previewed here. Open the original file to review it.</div>}
      </div>
      {busy && <div className="enrollee-review-preview-loading" role="status">Loading file preview…</div>}
      {error && (
        <div className="enrollee-review-preview-loading is-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn secondary small" onClick={retry}>Try again</button>
        </div>
      )}
    </div>
  );
};

export default PdfJsDocumentPreview;
