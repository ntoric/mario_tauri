const DEVICE_ID_KEY = 'mario_device_id';

/**
 * Returns this device's stable identifier, generating and persisting one on
 * first use. The ID designates which machine acts as a store's remote bill
 * printer (see Business Settings → Printer → Remote Bill Printer) and travels
 * on every print-queue request so the backend can enforce store separation.
 */
export const getDeviceId = (): string => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};
