import { Model } from 'objection';
import Session from './Session.js';

class Conversation extends Model {
    static get tableName() {
        return 'conversations';
    }
    static get relationMappings() {
        return {
            session: {
                relation: Model.BelongsToOneRelation,
                modelClass: Session,
                join: {
                    from: 'conversations.session_id',
                    to: 'sessions.id'
                }
            }
        };
    }
}
export default Conversation;
