import { Model } from 'objection';

class Table extends Model {
    static get tableName() {
        return 'tables';
    }
    static get relationMappings() {
        return {};
    }
}
export default Table;
