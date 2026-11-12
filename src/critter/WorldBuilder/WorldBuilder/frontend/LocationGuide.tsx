import React from "react";
import { AppContext } from "./domain";
import { CharacterDossier } from "./CharacterDossier";

export function LocationGuide({
  ctx,
  id,
  campaignId = "",
  reader = false,
}: {
  ctx: AppContext;
  id: string;
  campaignId?: string;
  reader?: boolean;
}) {
  return (
    <CharacterDossier
      ctx={ctx}
      id={id}
      campaignId={campaignId}
      reader={reader}
      locationMode
    />
  );
}
