import type { MediaCandidate } from "./media-scout-types";

export type ShotRole =
  | "establishing"
  | "human"
  | "detail"
  | "process"
  | "evidence"
  | "graphic_interrupt"
  | "payoff";

export type Shot = {
  id: string;
  role: ShotRole;
  startSec: number;
  durationSec: number;
  candidate?: MediaCandidate;
  note: string;
  treatment:
    | "slow_push"
    | "ken_burns"
    | "hold"
    | "crop_detail"
    | "split"
    | "graphic"
    | "fade";
};

export type SceneShotSequence = {
  sceneId: string;
  headline: string;
  totalDurationSec: number;
  shots: Shot[];
  rhythm: "slow" | "medium" | "fast";
  rationale: string;
};
