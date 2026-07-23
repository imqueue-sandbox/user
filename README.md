# user

A MongoDB-backed [@imqueue](https://github.com/imqueue) RPC microservice that owns **customer
accounts and their garage of cars** for the Car-Wash tutorial.

It stores users (credentials, profile, admin/active flags) and the list of cars each user has
registered. It never speaks HTTP — every method is exposed as a typed remote call over the
`@imqueue/rpc` Redis message queue and is consumed by the gateways (`api`, `api-rest`), which in
turn serve the front-ends.

## About the tutorial

This repo is one piece of the **imqueue-sandbox** tutorial — a complete car-wash booking app
built from independent RPC microservices that communicate over a Redis-backed message queue.

| Repo | Role | Store |
|------|------|-------|
| **[user](https://github.com/imqueue-sandbox/user)** | Customer accounts & their garage | MongoDB |
| [auth](https://github.com/imqueue-sandbox/auth) | Login, JWT issuing & revocation | Redis |
| [car](https://github.com/imqueue-sandbox/car) | Car catalog (makes / models / types) | in-memory |
| [time-table](https://github.com/imqueue-sandbox/time-table) | Washing reservations & schedule | PostgreSQL |
| [api](https://github.com/imqueue-sandbox/api) | GraphQL gateway orchestrating the fleet | — |
| [api-rest](https://github.com/imqueue-sandbox/api-rest) | REST/OpenAPI gateway over the same fleet | — |
| [web-app](https://github.com/imqueue-sandbox/web-app) | React front-end on `api` (GraphQL/Relay) | — |
| [web-app-rest](https://github.com/imqueue-sandbox/web-app-rest) | React front-end on `api-rest` (REST) | — |

The backend services are transport-agnostic: two interchangeable gateways and two matching
front-ends prove the same fleet can be fronted by completely different API styles without
changing a single service.

## RPC methods

Exposed by the `User` service (`src/User.ts`) via `@expose()`:

| Method | Signature | Description |
|---|---|---|
| `version` | `()` | Running service name / version / repository. |
| `update` | `(data, fields?)` | Upsert a user (create when no `_id`); bcrypt-hashes `password`. |
| `fetch` | `(criteria, fields?)` | Find one user by email (contains `@`) or by id. |
| `find` | `(filters?, fields?, skip?, limit?)` | Paginated, filtered user list (case-insensitive). |
| `count` | `(filters?)` | Count users matching filters. |
| `carsCount` | `(idOrEmail)` | Number of cars in a user's garage. |
| `addCar` | `(userId, carId, regNumber, fields?)` | Add a car; enforces the per-user limit and unique reg-number. |
| `removeCar` | `(carId, fields?)` | Remove a car by its garage sub-document id. |
| `getCar` | `(userId, carId)` | Fetch a single car from a user's garage. |

The `password` is bcrypt-hashed on write and never returned to callers that don't request it.
A user's garage is capped at **6 cars**, duplicate registration numbers are rejected, and the
`email` field is unique.

## Configuration

Environment variables (loaded from an optional `.env` via `process.loadEnvFile()`):

| Variable | Default | Purpose |
|---|---|---|
| `USER_DB` | `mongodb://localhost/user` | MongoDB connection string. |
| `IMQ_REDIS` | `localhost:6379` | Redis endpoint(s) for the RPC message queue. |
| `BCRYPT_ROUNDS` | `10` | bcrypt cost factor for password hashing. |

## Running

Development mode (rebuilds and restarts on change):

~~~bash
npm run dev
~~~

Production mode:

~~~bash
npm start
~~~

Both start the service under the imqueue label `user`. A MongoDB instance must be reachable at
`USER_DB` and Redis at `IMQ_REDIS`.

## License

[ISC License](LICENSE)
