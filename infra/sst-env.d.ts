/* SST generates equivalent resource typings during deploy/dev. This ambient
 * declaration keeps standalone CI typechecks deterministic without importing
 * SST's generated platform source tree into the application TypeScript pass. */
declare module "sst" {
  export const Resource: {
    EmailRelayToken: {
      type: "sst.sst.Secret";
      value: string;
    };
  };
}
