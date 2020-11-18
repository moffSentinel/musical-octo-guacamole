import React, { createContext, FunctionComponent, useContext, useEffect, useReducer } from "react";

import { ActionsUnion } from "@carweb/common/actions";
import { createActionPayload } from "@carweb/common/actions";
import { LoaderOrErrorPage } from "@carweb/components/error";
import { Skeleton } from "@carweb/components/ui";
import { IntlKey } from "@carweb/i18n";
import { logger } from "@carweb/logger";
import { useNavigation } from "@carweb/navigation";

const WIZARD_COMPLETE = "@Wizard/complete";
const WIZARD_CANCEL = "@Wizard/cancel";

enum WizardAction {
  nextStep = "@Wizard/steps/next",
  previousStep = "@Wizard/steps/previous",
  reset = "@Wizard/steps/reset"
}

const wizardAction = {
  nextStep: createActionPayload<typeof WizardAction.nextStep, any>(WizardAction.nextStep),
  previous: createActionPayload<typeof WizardAction.previousStep, any>(WizardAction.previousStep),
  reset: createActionPayload<typeof WizardAction.reset, string[]>(WizardAction.reset)
};

interface WizardState {
  steps: WizardStep[];
  currentLocation: string;
}

interface WizardStep {
  key: string;
  state: any;
  nextButtonIntlKey: IntlKey;
}

interface WizardCompleteState {
  [p: string]: unknown;
}

interface MetaData {
  [p: string]: string;
}

interface WizardContextProps {
  /**
   * This is used by the step to go to the next step in the wizard (use click next/complete),
   * All the state for the step should be passed here.
   * If onNext on the last step the `onWizardComplete` event will trigger otherwise the `onWizardStepChanged` will trigger
   */
  onNext: (state: any) => void;
  /**
   * This is used by the step to go to the previous step in the wizard (user click back button)
   * All the state for the step should be passed here.
   * If onBack on the first step the `onWizardCancel` event will trigger otherwise the `onWizardStepChanged` will trigger
   */
  onBack: (state: any) => void;
  /**
   * This is used to cancel the wizard
   * will trigger the `onWizardCancel` event
   */
  onCancel: () => void;
  /**
   * Steps can use this property to get their previous state
   * If this is the first time the step is activated, this property will be null otherwise it will contain the state
   * provided by onNext or onBack
   */
  previousState: unknown;
  /**
   * The intl key that should be provided to the next button
   * For all steps except the last the `nextIntlKey` will be provided,
   * and the last step will get `completeIntlKey`
   */
  nextButtonIntlKey: IntlKey;
  /**
   * Dictionary of key value pairs provided by the Wizard containter
   */
  meta: MetaData;
}

interface WizardContextProviderProps {
  /**
   * This will be called when next is called by the last step
   * state will be a dictionary with the state accociated with the step keys
   */
  onWizardComplete: (state: WizardCompleteState) => void;
  /**
   * This is called when the step call cancel or back is called on the first step
   */
  onWizardCancel: () => void;
  /**
   * This is called when the steps call next or back (and it does not triffer complete or cancel)
   * It will give out the next step key to activate
   * The wizard should then navigate to "`${match.url}/${location}`"
   * Note! the match.url part may be moved into the wizard provider in the future
   */
  onWizardStepChanged: (location: string, prevStepState?: any) => void;
  /**
   * Keys for the steps in the wizard.
   * They will be used to store state when moving between steps,
   * and used as subroutes for the wizard.
   *
   * Keys must have a corresponging route with path "`${match.url}/{key}`" as children to the provider
   */
  steps: string[];
  /**
   * This Intl Key is given to the steps for the "next button" Intl Key when there are more steps
   */
  nextIntlKey: IntlKey;
  /**
   * This Intl Key is given to the steps for the "next button" Intl Key when its the last step
   */
  completeIntlKey: IntlKey;
  /**
   * Colletion of key values that can be given to the steps
   */
  meta?: MetaData;
}

const WizardContext = createContext<WizardContextProps>({} as any);

export const WizardContextProvider: FunctionComponent<WizardContextProviderProps> = ({
  steps: wizardSteps,
  onWizardStepChanged,
  onWizardCancel,
  onWizardComplete,
  nextIntlKey,
  completeIntlKey,
  meta,
  children
}) => {
  const { location, matchUrl } = useNavigation();

  const getNextPage = () => {
    const nextStepIndex = getCurrentStepIndex() + 1;

    if (nextStepIndex >= wizardSteps.length) {
      return WIZARD_COMPLETE;
    }

    const nextLocation = wizardSteps[nextStepIndex];
    return nextLocation;
  };

  const getPreviousPage = () => {
    const previousStepIndex = getCurrentStepIndex() - 1;
    if (previousStepIndex < 0) {
      return WIZARD_CANCEL;
    }

    const nextLocation = wizardSteps[previousStepIndex];
    return nextLocation;
  };

  const getCurrentStepName = () => {
    const currentStepName = location.pathname.replace(`${matchUrl}/`, "");
    return currentStepName;
  };

  const getCurrentStepIndex = (stepName?: string) => {
    const currentStepName = !!stepName ? stepName : getCurrentStepName();
    return wizardSteps.findIndex((current) => currentStepName === `${current}`);
  };

  const [{ currentLocation, steps }, dispatch] = useReducer(
    (state: WizardState, action: ActionsUnion<typeof wizardAction>) => {
      if (action.payload instanceof Error) {
        logger.error(action.payload.message, action);
        return state;
      }

      switch (action.type) {
        case WizardAction.previousStep: {
          const currentStepIndex = getCurrentStepIndex();
          const newSteps = state.steps.map((step, index) => {
            if (index !== currentStepIndex) {
              return step;
            }

            return { ...step, state: action.payload };
          });

          return {
            steps: newSteps,
            currentLocation: getPreviousPage()
          };
        }
        case WizardAction.nextStep: {
          const currentStepIndex = getCurrentStepIndex();

          const newSteps = state.steps.map((step, index) => {
            if (index !== currentStepIndex) {
              return step;
            }

            return { ...step, state: action.payload };
          });

          return {
            steps: newSteps,
            currentLocation: getNextPage()
          };
        }
        case WizardAction.reset: {
          const stepCount = action.payload.length;

          if (stepCount === 0) {
            return { steps: [], currentLocation: "" };
          }

          const nextSteps = action.payload.map((key, index) => ({
            key,
            state: null,
            nextButtonIntlKey: index + 1 === stepCount ? completeIntlKey : nextIntlKey
          }));

          return {
            steps: nextSteps,
            currentLocation: nextSteps[0].key
          };
        }
        default:
          logger.warn("Unhandeled message type", action);

          return state;
      }
    },
    { steps: [], currentLocation: "" }
  );

  useEffect(() => {
    dispatch(wizardAction.reset(wizardSteps));
  }, [wizardSteps]);

  useEffect(() => {
    if (!currentLocation) {
      return;
    }

    switch (currentLocation) {
      case WIZARD_COMPLETE: {
        const completeState: WizardCompleteState = {};
        steps.forEach((step) => (completeState[step.key] = step.state));
        onWizardComplete(completeState);
        break;
      }
      case WIZARD_CANCEL:
        onWizardCancel();
        break;
      default:
        onWizardStepChanged(currentLocation, steps[getCurrentStepIndex()]?.state);
        break;
    }
  }, [currentLocation]);

  const currentStep = steps.filter((step) => step.key === currentLocation)[0];
  if (!currentStep) {
    return (
      <LoaderOrErrorPage headingPageIntlKey={completeIntlKey}>
        <Skeleton />
      </LoaderOrErrorPage>
    );
  }

  return (
    <WizardContext.Provider
      value={{
        onNext: (payload) => dispatch(wizardAction.nextStep(payload)),
        onBack: (payload) => dispatch(wizardAction.previous(payload)),
        onCancel: onWizardCancel,
        get previousState() {
          const stepName = getCurrentStepName();
          const stepIndex = getCurrentStepIndex(stepName);
          if (stepIndex === -1) {
            return null;
          }

          const foundState = steps[stepIndex].state;

          return foundState;
        },
        meta: meta ?? {},
        nextButtonIntlKey: currentStep.nextButtonIntlKey
      }}
    >
      {children}
    </WizardContext.Provider>
  );
};

export const useWizardContext = () => {
  const context = useContext(WizardContext);

  if (context === null) {
    throw new Error(`useWizardContext must be used within an WizardContextProvider`);
  }

  return context;
};
