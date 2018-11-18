UID=$(shell id -u)
GID=$(shell id -g)

node:
	docker run -it --rm \
		-v "$(PWD)":/bib \
		-w /bib \
		node:10 \
		bash

prettier:
	docker run -it --rm \
		-v "$(PWD)":/bib \
		-w /bib \
		node:10 \
		sh -c "npm install -g prettier; prettier --write --ignore-path watchdog_pb.js *.js"

serve:
	docker run -it --rm \
		-v "$(PWD)":/bib \
		-w /bib \
		-p 8080:8080 \
		-p 8000:8000 \
		node:10 \
		sh -c "npm install; npm start"

deploy:
	docker run -it --rm \
		-v $(PWD):/bib \
		-w /bib \
		jchorl/appengine-node \
		sh -c "echo \"gcloud auth login\ngcloud config set project boysinblue-221115\ngcloud app deploy\ngcloud app deploy cron.yaml\" && \
		bash"
