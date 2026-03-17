import {
  Repository,
  FindOptionsWhere,
  FindOneOptions,
  FindManyOptions,
  DeepPartial,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';

export abstract class BaseRepository<T extends ObjectLiteral> {
  constructor(protected readonly repository: Repository<T>) {}

  async findById(id: string): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as unknown as FindOptionsWhere<T>,
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repository.findOne(options);
  }

  async findMany(options?: FindManyOptions<T>): Promise<T[]> {
    return this.repository.find(options);
  }

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async createMany(data: DeepPartial<T>[]): Promise<T[]> {
    const entities = this.repository.create(data);
    return this.repository.save(entities);
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    await this.repository.update(id, data as any);
  }

  async delete(id: string): Promise<void> {
    await this.repository.softDelete(id);
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where });
  }

  createQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repository.createQueryBuilder(alias);
  }
}
