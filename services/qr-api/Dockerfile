# Build a static binary: the final image has no libc.
FROM golang:1.26.10-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bin/api ./cmd/api

# Distroless: no shell or package manager to attack. It includes time zone data
# and runs as a non-root user.
FROM gcr.io/distroless/static-debian12:nonroot
ENV TZ=America/Lima
COPY --from=build /bin/api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
