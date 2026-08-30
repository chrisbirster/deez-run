/* SST generates this resource augmentation during deploy/dev. Keeping the
 * minimal linked-resource declarations in source makes standalone CI
 * typechecks deterministic before the first infrastructure deployment. */
declare module "sst" {
  export interface Resource {
    AuthEmail: {
      type: "sst.aws.Email";
      sender: string;
      configSet: string;
    };
    EmailRelayToken: {
      type: "sst.sst.Secret";
      value: string;
    };
  }
}

import "sst";
export {};
