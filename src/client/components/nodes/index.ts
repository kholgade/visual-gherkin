/**
 * Node type registry for React Flow
 */

import { FeatureNode } from './FeatureNode';
import { BackgroundNode } from './BackgroundNode';
import { ScenarioNode } from './ScenarioNode';
import { StepNode } from './StepNode';

export { FeatureNode } from './FeatureNode';
export { BackgroundNode } from './BackgroundNode';
export { ScenarioNode } from './ScenarioNode';
export { StepNode } from './StepNode';

export const nodeTypes = {
  feature: FeatureNode,
  background: BackgroundNode,
  scenario: ScenarioNode,
  step: StepNode,
};
