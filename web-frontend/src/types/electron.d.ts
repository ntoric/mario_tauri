declare global {
  interface Window {
    embeddedEnv?: {
      VITE_API_URL: string;
      VITE_APP_NAME: string;
      VITE_APP_VERSION: string;
      JWT_SECRET: string;
      PORT: string;
      NODE_ENV: string;
      SUPERADMIN_USERNAME: string;
      SUPERADMIN_PASSWORD: string;
      SUPERADMIN_NAME: string;
    };
  }
}

export {};
