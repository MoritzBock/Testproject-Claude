// Registers all built-in task renderers. Add new task types here (see docs/LEVEL_ERSTELLEN.md).
import './ChoiceTask';
import './ClozeTask';
import './MatchTask';
import './OrderTask';

export { getTaskRenderer, registerTaskRenderer } from './registry';
