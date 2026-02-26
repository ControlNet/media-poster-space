import {
  createCinematicBaseCssVariables,
  createTypographyCssVariables
} from "./styles";
import { createWallSceneRuntime, shouldRenderWallScene } from "./scene";
import { createOnboardingAppRuntime } from "./onboarding/runtime";

type FontMode = "brand" | "fallback";

const FONT_MODE_QUERY_PARAM = "brandFont";

function applyCssVariables(variables: Record<`--${string}`, string>, target: HTMLElement): void {
  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }
}

function resolveFontMode(searchParams: URLSearchParams): FontMode {
  return searchParams.get(FONT_MODE_QUERY_PARAM) === "fallback" ? "fallback" : "brand";
}

const rootElement = document.documentElement;
const currentUrl = new URL(window.location.href);
const fontMode = resolveFontMode(currentUrl.searchParams);

applyCssVariables(createCinematicBaseCssVariables(), rootElement);

if (fontMode === "fallback") {
  rootElement.dataset.brandFont = "fallback";
  applyCssVariables(createTypographyCssVariables(false), rootElement);
} else {
  delete rootElement.dataset.brandFont;
  applyCssVariables(createTypographyCssVariables(true), rootElement);
}

document.body.replaceChildren();

if (shouldRenderWallScene(currentUrl)) {
  const wallScene = createWallSceneRuntime(document.body);
  wallScene.start();
  window.addEventListener("beforeunload", () => wallScene.dispose(), { once: true });
} else {
  const onboardingRuntime = createOnboardingAppRuntime(document.body);
  onboardingRuntime.start();
  window.addEventListener("beforeunload", () => onboardingRuntime.dispose(), { once: true });
}
