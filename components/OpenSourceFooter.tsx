const GITHUB_URL = "https://github.com/fishenal/Gridhorizon";
const ISSUES_URL = "https://github.com/fishenal/Gridhorizon/issues";
const DISCORD_URL = "https://discord.gg/HxS7Z4p4EP";
const SUPPORT_URL = "https://www.fishenal.dev/support";

type Props = {
  /** Home hero is dark; play chrome sits on the map backdrop. */
  tone?: "onDark" | "onLight";
};

export function OpenSourceFooter({ tone = "onDark" }: Props) {
  const muted = tone === "onDark" ? "text-stone-300/90" : "text-stone-600";
  const link =
    tone === "onDark"
      ? "text-teal-200 underline-offset-2 hover:text-white hover:underline"
      : "text-teal-800 underline-offset-2 hover:text-teal-950 hover:underline";

  return (
    <footer
      className={`shrink-0 border-t px-4 py-2 text-center text-[11px] leading-snug sm:text-xs ${
        tone === "onDark"
          ? "border-white/10 bg-stone-950/55 backdrop-blur-sm"
          : "border-stone-200/80 bg-white/70 backdrop-blur-sm"
      } ${muted}`}
    >
      <p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          GitHub
        </a>
        {" · "}
        <a
          href={ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          Submit an issue
        </a>
        {" · "}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          Discord
        </a>
        {" · "}
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          Support me
        </a>
      </p>
    </footer>
  );
}
