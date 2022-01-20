FROM denoland/deno:alpine-1.17.3 AS builder

EXPOSE 9080
WORKDIR /app
COPY ./*.ts /app/

# Compile the app so that it doesn't need to be compiled on each startup/entry.
RUN deno compile --allow-all --output nlg nlg.ts

FROM frolvlad/alpine-glibc:alpine-3.13
COPY --from=builder /app/nlg /app/nlg
COPY ./dist /app/dist
WORKDIR /app

# Create a group and user
RUN addgroup -S deno && adduser -S deno -G deno

RUN chmod -R 755 /app
RUN chown -R deno:deno /app
USER deno

CMD ["./nlg"]
