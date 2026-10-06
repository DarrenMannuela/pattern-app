# The Go backend: built in a Go image, run from a small one.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/konveksi .

FROM alpine:3.20
# Certificates for the Claude API (photo reading); time zones for the logs.
RUN apk add --no-cache ca-certificates tzdata && adduser -D -H app
COPY --from=build /out/konveksi /usr/local/bin/konveksi
USER app
EXPOSE 8080
ENTRYPOINT ["konveksi"]
