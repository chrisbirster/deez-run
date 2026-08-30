/* SST generates this resource augmentation during deploy/dev. Keeping the
 * minimal linked-secret declaration in source makes standalone CI typechecks
 * deterministic before the first infrastructure deployment. */
declare module "sst" {
  export interface Resource {
    EmailRelayToken: {
      type: "sst.sst.Secret";
      value: string;
    };
  }
}

import "sst";
export {};
