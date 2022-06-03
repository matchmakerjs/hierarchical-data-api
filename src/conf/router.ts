import { SimpleRouter } from '@matchmakerjs/matchmaker';
import { IndexController } from '../app/controllers/index.controller';
import { ItemController } from '../app/controllers/item.controller';

export default SimpleRouter.fromControllers([IndexController, ItemController]);
