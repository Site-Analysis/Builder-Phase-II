# Caddy config for qnit-builder EC2.
# Terminates TLS (auto Let's Encrypt) for 2 builder.qnit.site subdomains.
# Caddy runs as a Docker service and resolves backends via Docker DNS.
# CORS is handled by each FastAPI service — do NOT add CORS headers here.

auth.builder.qnit.site {
	encode gzip
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"
	reverse_proxy keycloak:8080
}

api.builder.qnit.site {
	encode gzip
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"

	handle /weather/* {
		reverse_proxy temperature:8000
	}
	handle_path /temperature/* {
		reverse_proxy temperature:8000
	}
	handle /flood/* {
		reverse_proxy flood:8002
	}
	handle /wind/* {
		reverse_proxy wind:8003
	}
	handle /rainfall/* {
		reverse_proxy rainfall:8004
	}
	handle /geo/* {
		reverse_proxy geo:8005
	}
	handle /planning/* {
		reverse_proxy planning:8006
	}
	handle /infrastructure/* {
		reverse_proxy infrastructure:8007
	}
	handle /future-infra/* {
		reverse_proxy future-infra:8008
	}
	handle /land-records/* {
		reverse_proxy land-records:8009
	}
	handle /report/* {
		reverse_proxy report:8010
	}
	handle /cadastral/* {
		reverse_proxy cadastral:8011
	}
	handle /status/temperature {
		rewrite * /health
		reverse_proxy temperature:8000
	}
	handle /status/flood {
		rewrite * /health
		reverse_proxy flood:8002
	}
	handle /status/wind {
		rewrite * /health
		reverse_proxy wind:8003
	}
	handle /status/rainfall {
		rewrite * /health
		reverse_proxy rainfall:8004
	}
	handle /status/geo {
		rewrite * /health
		reverse_proxy geo:8005
	}
	handle /status/planning {
		rewrite * /health
		reverse_proxy planning:8006
	}
	handle /status/infrastructure {
		rewrite * /health
		reverse_proxy infrastructure:8007
	}
	handle /status/future-infra {
		rewrite * /health
		reverse_proxy future-infra:8008
	}
	handle /status/land-records {
		rewrite * /health
		reverse_proxy land-records:8009
	}
	handle /status/cadastral {
		rewrite * /health
		reverse_proxy cadastral:8011
	}
	handle / {
		respond "qnit builder api ok" 200
	}
	handle {
		respond "not found" 404
	}
}
