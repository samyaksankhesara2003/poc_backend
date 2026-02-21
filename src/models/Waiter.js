import { Model } from 'objection';

class Waiter extends Model {
    static get tableName() {
        return 'waiters';
    }
    static get relationMappings() {
        return {};
    }
}
export default Waiter;
