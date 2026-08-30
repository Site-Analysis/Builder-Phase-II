# Unified Caddy config for qnit EC2.
# Handles api.qnit.site (main SAT) + api.builder.qnit.site + auth.builder.qnit.site.
# Terminates TLS (auto Let's Encrypt). CORS handled per-service, not here.

api.qnit.site {
	encode gzip
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"

	handle /weather/* {
		reverse_proxy temperature:8000
	}
	handle_path /temperature/* {
		reverse_proxy temperature:8000
	}
	handle /sunpath/* {
		reverse_proxy sunpath:8001
	}
	handle /buildings/* {
		reverse_proxy sunpath:8001
	}
	handle /shadow/* {
		reverse_proxy sunpath:8001
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
	handle /status/temperature { rewrite * /health; reverse_proxy temperature:8000 }
	handle /status/sunpath     { rewrite * /health; reverse_proxy sunpath:8001 }
	handle /status/flood       { rewrite * /health; reverse_proxy flood:8002 }
	handle /status/wind        { rewrite * /health; reverse_proxy wind:8003 }
	handle /status/rainfall    { rewrite * /health; reverse_proxy rainfall:8004 }
	handle /status/geo         { rewrite * /health; reverse_proxy geo:8005 }
	handle /status/planning    { rewrite * /health; reverse_proxy planning:8006 }
	handle /status/infrastructure { rewrite * /health; reverse_proxy infrastructure:8007 }
	handle /status/future-infra   { rewrite * /health; reverse_proxy future-infra:8008 }
	handle /status/land-records   { rewrite * /health; reverse_proxy land-records:8009 }
	handle / { respond "qnit api ok" 200 }
	handle   { respond "not found" 404 }
}

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
	handle_path /cadastral/* {
		reverse_proxy cadastral:8011
	}
	handle /status/temperature    { rewrite * /health; reverse_proxy temperature:8000 }
	handle /status/flood          { rewrite * /health; reverse_proxy flood:8002 }
	handle /status/wind           { rewrite * /health; reverse_proxy wind:8003 }
	handle /status/rainfall       { rewrite * /health; reverse_proxy rainfall:8004 }
	handle /status/geo            { rewrite * /health; reverse_proxy geo:8005 }
	handle /status/planning       { rewrite * /health; reverse_proxy planning:8006 }
	handle /status/infrastructure { rewrite * /health; reverse_proxy infrastructure:8007 }
	handle /status/future-infra   { rewrite * /health; reverse_proxy future-infra:8008 }
	handle /status/land-records   { rewrite * /health; reverse_proxy land-records:8009 }
	handle /status/cadastral      { rewrite * /health; reverse_proxy cadastral:8011 }
	handle / { respond "qnit builder api ok" 200 }
	handle   { respond "not found" 404 }
}
