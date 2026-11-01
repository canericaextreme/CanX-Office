// Offline visual fixture: no sign-in, server functions, credentials or provider requests.
export const syncOfficeHours = () => {
  throw new Error("No live calls in this fixture");
};
export const useServerFn = () => syncOfficeHours;
export const useOwnerSession = () => ({ stepUpComplete: true, viewer: false });
