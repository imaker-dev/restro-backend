const { query, execute, transaction, getConnection } = require('../database');

class BaseModel {
  static tableName = '';
  static primaryKey = 'id';
  static timestamps = true;
  static softDeletes = false;

  static async findById(id, columns = ['*']) {
    const sql = `SELECT ${columns.join(', ')} FROM ${this.tableName} WHERE ${this.primaryKey} = ?${this.softDeletes ? ' AND deleted_at IS NULL' : ''} LIMIT 1`;
    const results = await query(sql, [id]);
    return results[0] || null;
  }

  static async findOne(conditions, columns = ['*']) {
    const { whereClause, values } = this.buildWhereClause(conditions);
    const sql = `SELECT ${columns.join(', ')} FROM ${this.tableName} ${whereClause}${this.softDeletes ? ' AND deleted_at IS NULL' : ''} LIMIT 1`;
    const results = await query(sql, values);
    return results[0] || null;
  }

  static async findAll(conditions = {}, options = {}) {
    const { whereClause, values } = this.buildWhereClause(conditions);
    const columns = options.columns || ['*'];
    const orderBy = options.orderBy ? ` ORDER BY ${options.orderBy}` : '';
    const limit = options.limit ? ` LIMIT ${options.limit}` : '';
    const offset = options.offset ? ` OFFSET ${options.offset}` : '';
    
    let sql = `SELECT ${columns.join(', ')} FROM ${this.tableName} ${whereClause}`;
    if (this.softDeletes) {
      sql += whereClause ? ' AND deleted_at IS NULL' : ' WHERE deleted_at IS NULL';
    }
    sql += `${orderBy}${limit}${offset}`;
    
    return query(sql, values);
  }

  static async count(conditions = {}) {
    const { whereClause, values } = this.buildWhereClause(conditions);
    let sql = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
    if (this.softDeletes) {
      sql += whereClause ? ' AND deleted_at IS NULL' : ' WHERE deleted_at IS NULL';
    }
    const results = await query(sql, values);
    return results[0].total;
  }

  static async create(data) {
    if (this.timestamps) {
      data.created_at = new Date();
      data.updated_at = new Date();
    }
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await execute(sql, values);
    
    return this.findById(result.insertId);
  }

  static async createMany(dataArray) {
    if (dataArray.length === 0) return [];
    
    const now = new Date();
    const processedData = dataArray.map(data => {
      if (this.timestamps) {
        data.created_at = now;
        data.updated_at = now;
      }
      return data;
    });
    
    const columns = Object.keys(processedData[0]);
    const placeholders = processedData.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const values = processedData.flatMap(data => Object.values(data));
    
    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES ${placeholders}`;
    const result = await execute(sql, values);
    
    return result;
  }

  static async update(id, data) {
    if (this.timestamps) {
      data.updated_at = new Date();
    }
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${this.primaryKey} = ?`;
    await execute(sql, [...values, id]);
    
    return this.findById(id);
  }

  static async updateWhere(conditions, data) {
    if (this.timestamps) {
      data.updated_at = new Date();
    }
    
    const { whereClause, values: whereValues } = this.buildWhereClause(conditions);
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} ${whereClause}`;
    const result = await execute(sql, [...values, ...whereValues]);
    
    return result.affectedRows;
  }

  static async delete(id) {
    if (this.softDeletes) {
      return this.update(id, { deleted_at: new Date() });
    }
    
    const sql = `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = ?`;
    const result = await execute(sql, [id]);
    return result.affectedRows > 0;
  }

  static async deleteWhere(conditions) {
    const { whereClause, values } = this.buildWhereClause(conditions);
    
    if (this.softDeletes) {
      const sql = `UPDATE ${this.tableName} SET deleted_at = ? ${whereClause}`;
      const result = await execute(sql, [new Date(), ...values]);
      return result.affectedRows;
    }
    
    const sql = `DELETE FROM ${this.tableName} ${whereClause}`;
    const result = await execute(sql, values);
    return result.affectedRows;
  }

  static async restore(id) {
    if (!this.softDeletes) return false;
    
    const sql = `UPDATE ${this.tableName} SET deleted_at = NULL, updated_at = ? WHERE ${this.primaryKey} = ?`;
    const result = await execute(sql, [new Date(), id]);
    return result.affectedRows > 0;
  }

  static async exists(conditions) {
    const result = await this.findOne(conditions, ['1']);
    return !!result;
  }

  static async paginate(conditions = {}, page = 1, limit = 20, options = {}) {
    const offset = (page - 1) * limit;
    const total = await this.count(conditions);
    const data = await this.findAll(conditions, { ...options, limit, offset });
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static buildWhereClause(conditions) {
    const keys = Object.keys(conditions);
    if (keys.length === 0) {
      return { whereClause: '', values: [] };
    }
    
    const clauses = [];
    const values = [];
    
    for (const key of keys) {
      const value = conditions[key];
      
      if (value === null) {
        clauses.push(`${key} IS NULL`);
      } else if (Array.isArray(value)) {
        clauses.push(`${key} IN (${value.map(() => '?').join(', ')})`);
        values.push(...value);
      } else if (typeof value === 'object' && value.operator) {
        clauses.push(`${key} ${value.operator} ?`);
        values.push(value.value);
      } else {
        clauses.push(`${key} = ?`);
        values.push(value);
      }
    }
    
    return {
      whereClause: `WHERE ${clauses.join(' AND ')}`,
      values,
    };
  }

  static async rawQuery(sql, params = []) {
    return query(sql, params);
  }

  static async transaction(callback) {
    return transaction(callback);
  }
}

module.exports = BaseModel;
