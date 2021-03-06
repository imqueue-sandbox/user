/*!
 * ISC License
 * 
 * Copyright (c) 2018, Imqueue Sandbox
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
import { IMQService, expose, profile, IMessageQueue } from '@imqueue/rpc';
import * as mongoose from 'mongoose';
import { md5, isEmail } from './helpers';
import { UserObject, UserFilters, UserCarObject } from './types';
import { USER_DB, MAX_USER_CARS_COUNT } from '../config';
import { schema } from './schema';
import {
    ADD_CAR_LIMIT_EXCEEDED_ERROR,
    ADD_CAR_DUPLICATE_ERROR,
    ADD_USER_DUPLICATE_ERROR,
    INTERNAL_ERROR,
    INVALID_CAR_ID_ERROR,
} from './errors';

/**
 * User service implementation
 */
export class User extends IMQService {

    private db: mongoose.Connection;
    private UserModel: mongoose.Model<any>;

    /**
     * Transforms given filters into mongo-specific filters object
     *
     * @param {UserFilters} filters
     * @return {any}
     */
    private prepare(filters: UserFilters) {
        for (let filter of Object.keys(filters)) {
            if (~['isAdmin', 'isActive'].indexOf(filter)) {
                continue;
            }

            (filters as any)[filter] = {
                $regex: (filters as any)[filter],
                $options: 'i'
            };
        }

        return filters;
    }

    /**
     * Initializes mongo database connection and user schema
     *
     * @return Promise<any>
     */
    @profile()
    private async initDb(): Promise<any> {
        return new Promise((resolve, reject) => {
            mongoose.set('useCreateIndex', true);
            mongoose.set('useNewUrlParser', true);
            mongoose.connect(USER_DB);

            this.db = mongoose.connection;
            this.db.on('error', reject);
            this.db.once('open', resolve);

            this.UserModel = mongoose.model('User', schema);
        });
    }

    /**
     * Overriding start method to inject mongodb connection establishment
     */
    @profile()
    public async start(): Promise<IMessageQueue | undefined> {
        this.logger.log('Initializing MongoDB connection...');
        await this.initDb();

        return super.start();
    }

    /**
     * Creates new user object in a database
     *
     * @param {UserObject} data
     * @param {string[]} fields
     * @return {UserObject}
     */
    @profile()
    private async createUser(data: UserObject, fields?: string[]) {
        try {
            const user = new this.UserModel(data);
            await user.save();

            return this.fetch(data.email, fields);
        } catch (err) {
            if (/duplicate key/.test(err)) {
                throw ADD_USER_DUPLICATE_ERROR;
            } else {
                throw err;
            }
        }
    }

    /**
     * Updates existing user object in a database
     *
     * @param {UserObject} data
     * @param {string[]} fields
     * @return {UserObject}
     */
    @profile()
    private async updateUser(data: UserObject, fields?: string[]) {
        const _id = String(data._id);

        delete data._id;
        await this.UserModel.updateOne({ _id }, data).exec();

        return this.fetch(_id, fields);
    }

    /**
     * Creates or updates existing user with the new data set
     *
     * @param {UserObject} data - user data fields
     * @param {string[]} [fields] - fields to return on success
     * @return {Promise<UserObject | null>} - saved user data object
     */
    @profile()
    @expose()
    public async update(
        data: UserObject,
        fields?: string[]
    ): Promise<UserObject | null> {
        if (data.password) {
            data.password = md5(data.password);
        }

        if (data._id) {
            return await this.updateUser(data, fields);
        }

        else {
            return await this.createUser(data, fields);
        }
    }

    /**
     * Returns number of cars registered for the user having given id or email
     *
     * @param {string} idOrEmail
     * @return {Promise<number>}
     */
    @profile()
    @expose()
    public async carsCount(idOrEmail: string): Promise<number> {
        const field = isEmail(idOrEmail) ? 'email' : '_id';
        const ObjectId = mongoose.Types.ObjectId;

        if (field === '_id') {
            idOrEmail = ObjectId(idOrEmail) as any;
        }

        return ((await this.UserModel.aggregate([
            { $match: { [field]: idOrEmail } },
            { $project: { carsCount: { $size: "$cars" } } }
        ]))[0] || {}).carsCount || 0
    }

    /**
     * Look-ups and returns user data by either user e-mail or by user object
     * identifier
     *
     * @param {string} criteria - user identifier or e-mail string
     * @param {string[]} [fields] - fields to select and return
     * @return {Promise<UserObject | null>} - found user object or nothing
     */
    @profile()
    @expose()
    public async fetch(
        criteria: string,
        fields?: string[]
    ): Promise<UserObject | null> {
        const ObjectId = mongoose.Types.ObjectId;
        let query: mongoose.DocumentQuery<UserObject | null, any>;

        if (isEmail(criteria)) {
            query = this.UserModel.findOne().where({
                email: criteria,
            });
        } else {
            query = this.UserModel.findById(ObjectId(criteria));
        }

        if (fields && fields.length) {
            query.select(fields.join(' '));
        }

        return await query.exec();
    }

    /**
     * Returns number of users stored in the system and matching given criteria
     *
     * @param {UserFilters} [filters] - filter by is active criteria
     * @return {Promise<number>} - number of user counted
     */
    @profile()
    @expose()
    public async count(filters?: UserFilters): Promise<number> {
        return await this.UserModel.count(
            this.prepare(filters || {} as UserFilters)
        ).exec();
    }

    /**
     * Returns collection of users matched is active criteria. Records
     * can be fetched skipping given number of records and having max length
     * of a given limit argument
     *
     * @param {UserFilters} [filters] - is active criteria to filter user list
     * @param {string[]} [fields] - list of fields to be selected and returned for each found user object
     * @param {number} [skip] - record to start fetching from
     * @param {number} [limit] - selected collection max length from a starting position
     * @return {Promise<UserObject[]>} - collection of users found
     */
    @profile()
    @expose()
    public async find(
        filters?: UserFilters,
        fields?: string[],
        skip?: number,
        limit?: number,
    ): Promise<UserObject[]> {
        const query = this.UserModel.find(
            this.prepare(filters || {} as UserFilters)
        );

        if (fields && fields.length) {
            query.select(fields.join(' '));
        }

        if (skip) {
            query.skip(skip);
        }

        if (limit) {
            query.limit(limit);
        }

        return await query.exec() as UserObject[];
    }

    /**
     * Attach new car to a user
     *
     * @param {string} userId - user identifier to add car to
     * @param {string} carId - selected car identifier
     * @param {string} regNumber - car registration number
     * @param {string[]} [selectedFields] - fields to fetch for a modified user object
     * @return {Promise<UserObject | null>} - operation result
     */
    @profile()
    @expose()
    public async addCar(
        userId: string,
        carId: string,
        regNumber: string,
        selectedFields?: string[],
    ): Promise<UserObject | null> {
        const ObjectId = mongoose.Types.ObjectId;
        const carsCount = await this.carsCount(userId);
        let result: any;

        if (carsCount >= MAX_USER_CARS_COUNT) {
            throw ADD_CAR_LIMIT_EXCEEDED_ERROR;
        }

        try {
            result = await this.UserModel.updateOne(
                { _id: ObjectId(userId), 'cars.regNumber': { $ne: regNumber } },
                { $push: { cars: { carId, regNumber } } },
            ).exec();
        } catch (err) {
            this.logger.log('addCar() error:', err);
            throw INTERNAL_ERROR;
        }

        if (result && result.ok && !result.nModified) {
            throw ADD_CAR_DUPLICATE_ERROR;
        }

        if (!(result && result.ok && result.nModified === 1)) {
            this.logger.log('addCar() invalid result:', result);
            throw INTERNAL_ERROR;
        }

        return await this.fetch(userId, selectedFields);
    }

    /**
     * Removes given car from a user
     *
     * @param {string} carId - user car identifier
     * @param {string[]} [selectedFields] - fields to fetch for a modified user object
     * @return {Promise<UserObject | null>} - modified user object
     */
    @profile()
    @expose()
    public async removeCar(
        carId: string,
        selectedFields?: string[],
    ): Promise<UserObject | null> {
        try {
            const user = await this.UserModel.findOne({
                'cars._id': mongoose.Types.ObjectId(carId)
            });

            if (!user) {
                throw INVALID_CAR_ID_ERROR;
            }

            await this.UserModel.updateOne(
                { 'cars._id': mongoose.Types.ObjectId(carId) },
                { $pull: { cars: { _id: mongoose.Types.ObjectId(carId) } } },
            ).exec();

            return await this.fetch(String(user._id), selectedFields);
        } catch (err) {
            this.logger.log('removeCar() error:', err);
            throw INTERNAL_ERROR;
        }
    }

    /**
     * Returns car object of a given user, fetched by identifier
     *
     * @param {string} userId - user identifier
     * @param {string} carId - car identifier
     * @return {Promise<UserCarObject | null>}
     */
    @profile()
    @expose()
    public async getCar(
        userId: string,
        carId: string,
    ): Promise<UserCarObject | null> {
        return (await this.UserModel
            .findOne({ _id: mongoose.Types.ObjectId(userId) })
            .select(['cars._id', 'cars.carId', 'cars.regNumber'])
            .exec() || { cars: [] })
            .cars
            .find((car: UserCarObject) => String(car._id) === carId) || null;
    }
}
