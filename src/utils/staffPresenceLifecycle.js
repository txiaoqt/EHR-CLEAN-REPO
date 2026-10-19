// Auth can stop publishers before removing the JWT. Each browser tab owns only
// its own publisher; other signed-in tabs/devices remain present independently.
const publishers = new Set();

export const registerStaffPresenceStop = (stop) => {
  publishers.add(stop);
  return () => publishers.delete(stop);
};

export const stopStaffPresence = async () => {
  await Promise.allSettled([...publishers].map((stop) => stop()));
};
