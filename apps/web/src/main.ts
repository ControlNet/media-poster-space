import {
  createCinematicBaseCssVariables
} from "./styles";
import { createWallSceneRuntime, shouldRenderWallScene } from "./scene";
import { createOnboardingAppRuntime } from "./onboarding/runtime";
import { restorePendingPagesRedirect } from "./routing/base-path";

function applyCssVariables(variables: Record<`--${string}`, string>, target: HTMLElement): void {
  for (const [name, value] of Object.entries(variables)) {
    target.style.setProperty(name, value);
  }
}

const rootElement = document.documentElement;
restorePendingPagesRedirect();
const currentUrl = new URL(window.location.href);

applyCssVariables(createCinematicBaseCssVariables(), rootElement);

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
