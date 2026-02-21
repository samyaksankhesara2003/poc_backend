import { Model } from 'objection';
import Table from './Table.js';
import Waiter from './Waiter.js';

class Session extends Model {
    static get tableName() {
        return 'sessions';
    }
    static get relationMappings() {
        return {
            waiter: {
                relation: Model.BelongsToOneRelation,
                modelClass: Waiter,
                join: {
                    from: 'sessions.waiter_id',
                    to: 'waiters.id'
                }
            },
            table: {
                relation: Model.BelongsToOneRelation,
                modelClass: Table,
                join: {
                    from: 'sessions.table_id',
                    to: 'tables.id'
                }
            }
        };
    }
}
export default Session;
