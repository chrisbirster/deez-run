interface SeoProps {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}

const ORIGIN = "https://deez.run";

export function Seo(props: SeoProps) {
  const canonical = () => new URL(props.path, ORIGIN).toString();
  const fullTitle = () => (props.title === "deez.run" ? props.title : `${props.title} · deez.run`);

  return (
    <>
      <title>{fullTitle()}</title>
      <meta name="description" content={props.description} />
      <link rel="canonical" href={canonical()} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="deez.run" />
      <meta property="og:title" content={fullTitle()} />
      <meta property="og:description" content={props.description} />
      <meta property="og:url" content={canonical()} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle()} />
      <meta name="twitter:description" content={props.description} />
      {props.noindex ? <meta name="robots" content="noindex,follow" /> : null}
    </>
  );
}
