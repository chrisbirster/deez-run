/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    const production = input?.stage === "production";
    return {
      name: "deez-run-email",
      home: "aws",
      removal: production ? "retain" : "remove",
      protect: production,
      providers: {
        aws: {
          version: "7.30.0",
          region: "us-east-1",
        },
        cloudflare: "6.14.0",
      },
    };
  },

  async run() {
    const relayToken = new sst.Secret("EmailRelayToken");

    // SES identity and DKIM/MAIL FROM DNS are managed through Cloudflare.
    // This is intentionally a subdomain so existing apex mail/DMARC settings
    // for deez.run are not replaced by this stack.
    const authEmail = new sst.aws.Email("AuthEmail", {
      sender: "auth.deez.run",
      dns: sst.cloudflare.dns(),
      dmarc: "v=DMARC1; p=none; adkim=s; aspf=s;",
      mailFrom: {
        domain: "bounce.auth.deez.run",
        rejectOnMxFailure: true,
      },
    });

    const api = new sst.aws.ApiGatewayV2("EmailRelayApi", {
      cors: false,
      accessLog: {
        retention: "1 week",
      },
      transform: {
        stage: (args) => {
          // API Gateway access logs do not include request bodies. Keep this
          // narrow endpoint additionally bounded at the gateway before the
          // application-level per-email limiter in Deez.
          args.defaultRouteSettings = {
            throttlingBurstLimit: 10,
            throttlingRateLimit: 2,
          };
        },
      },
    });

    api.route("POST /send-magic-link", {
      handler: "functions/send-magic-link.handler",
      timeout: "10 seconds",
      memory: "256 MB",
      link: [authEmail, relayToken],
    });

    return {
      emailRelayEndpoint: $interpolate`${api.url}send-magic-link`,
      sesSenderDomain: authEmail.sender,
      fromAddress: "Deez <login@auth.deez.run>",
      region: "us-east-1",
    };
  },
});
