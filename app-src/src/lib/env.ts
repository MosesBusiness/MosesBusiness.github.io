// Build-time flags. WEB = the standalone web app (moshebin.com/hon-shaket/), otherwise the Claude artifact.
declare const __WEB__: boolean | undefined;
declare const __BASE__: string | undefined;
export const WEB: boolean = typeof __WEB__ !== 'undefined' && !!__WEB__;
export const BASE: string = typeof __BASE__ !== 'undefined' && __BASE__ ? __BASE__ : '/';
export const ARTIFACT_URL = 'https://claude.ai/artifact/CGgni1NAf2QTh2xmw8t5hA';
