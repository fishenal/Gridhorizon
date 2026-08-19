export type TollNoticeRole = "payer" | "owner";

export type TollNotice = {
  id: number;
  role: TollNoticeRole;
  buildingType: string;
  buildingName: string | null;
  otherPlayerName: string;
  amount: number;
};

export function isTownBuilding(type: string): boolean {
  return type === "town";
}

function quotedName(name: string | null): string | null {
  const t = name?.trim();
  return t ? t : null;
}

export function formatTollNotice(notice: TollNotice): {
  title: string;
  body: string;
} {
  const who = notice.otherPlayerName.trim() || "A traveler";
  const place = quotedName(notice.buildingName);
  const town = isTownBuilding(notice.buildingType);

  if (notice.role === "payer") {
    if (town) {
      return {
        title: "Town",
        body: place
          ? `You have entered ${who}'s town ${place}. You spent ${notice.amount} gold drinking and reveling here.`
          : `You have entered ${who}'s town. You spent ${notice.amount} gold drinking and reveling here.`,
      };
    }
    return {
      title: "Flag",
      body: place
        ? `You have entered ${who}'s flag ${place}. A ${notice.amount} gold toll will be charged.`
        : `You have entered ${who}'s flag range. A ${notice.amount} gold toll will be charged.`,
    };
  }

  if (town) {
    return {
      title: "Town",
      body: place
        ? `${who} is drinking and reveling in your town ${place}, bringing you ${notice.amount} gold.`
        : `${who} is drinking and reveling in your town, bringing you ${notice.amount} gold.`,
    };
  }

  return {
    title: "Flag",
    body: place
      ? `${who} entered your flag ${place} and paid a ${notice.amount} gold toll.`
      : `${who} entered your flag range and paid a ${notice.amount} gold toll.`,
  };
}
