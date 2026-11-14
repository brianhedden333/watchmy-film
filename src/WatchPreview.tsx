/* Browser-window preview of a film's watch page. Used on the landing page and /account. */

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 40) || "yourfilm"
  );
}

export function hueFor(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

type Props = {
  title: string;
  address: string;
  artUrl?: string;
  rentPrice?: string;
  rentalLabel?: string;
  buyPrice?: string;
  offerRent?: boolean;
  offerBuy?: boolean;
  className?: string;
};

export function WatchPreview({
  title,
  address,
  artUrl,
  rentPrice = "5.99",
  rentalLabel = "48 hours",
  buyPrice = "12.99",
  offerRent = true,
  offerBuy = true,
  className = "",
}: Props) {
  const shownTitle = title.trim() || "Your film";
  const hue = hueFor(shownTitle);
  const background = artUrl
    ? `center / cover no-repeat url("${artUrl}")`
    : `linear-gradient(160deg, hsl(${hue} 42% 30%), hsl(${(hue + 45) % 360} 48% 12%))`;

  return (
    <figure
      className={`browser ${className}`}
      role="img"
      aria-label={`Preview of the watch page for ${shownTitle} at ${address}`}
    >
      <div className="browser-bar" aria-hidden="true">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        <span className="address">
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.5 0h4V5a2 2 0 0 0-4 0z"
              fill="currentColor"
            />
          </svg>
          {address}
        </span>
      </div>
      <div className="screen" aria-hidden="true">
        <div className={`poster ${artUrl ? "has-art" : ""}`} style={{ background }}>
          {!artUrl && <span className="beam" />}
          <span className="poster-title">{shownTitle}</span>
          <span className="play" />
        </div>
        <div className="offer">
          {offerRent && (
            <span className="offer-btn primary">
              Rent for {rentalLabel} <b>${rentPrice || "0.00"}</b>
            </span>
          )}
          {offerBuy && (
            <span className={`offer-btn ${offerRent ? "" : "primary"}`}>
              Buy <b>${buyPrice || "0.00"}</b>
            </span>
          )}
        </div>
        <p className="offer-note">Card, Apple Pay or Google Pay. Already bought it? Sign in with your email.</p>
      </div>
    </figure>
  );
}
