# hierarchical-data-api

## Start Standalone

### create .env
```
ENVIRONMENT=dev
SERVER_PORT=5000

SWAGGER_UI_PATH=src/swagger-ui.html
API_DOC_PATH=openapi.json

TYPEORM_ENTITIES=src/app/data/entities/**/*.entity.ts

WEB_KEY_URL=http://127.0.0.1:8080/auth-api/web-keys/{kid}
```

### Start application and visit URL
`npm start` and open `http://127.0.0.1:5000`

## Start in Docker

### Create `docker-compose.yaml`

```
version: "3.8"

services:

  api:
    image: olaleye/hierarchical-data-api
    restart: unless-stopped
    environment:
      WEB_KEY_URL: http://authentication-api:5000/signature-keys/{kid}
    ports:
      - "${SERVER_PORT-5000}:${SERVER_PORT-5000}"
```

### Start application and visit URL
`docker-compose up` and open `http://127.0.0.1:5000`

## Build docker image
`docker build . -t node-sqlite3:18.2.0-alpine`
`npm run tsc && api-doc --input ./src/conf/router.ts --out ./openapi.json && docker-image --from 'node-sqlite3:18.2.0-alpine' --workDir /app-home/app --copy 'dist' --copy src/swagger-ui.html --copy openapi.json -t olaleye/hierarchical-data-api && docker push olaleye/hierarchical-data-api`