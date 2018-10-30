UID=$(shell id -u)
GID=$(shell id -g)

prettier:
	docker run -it --rm \
		-v "$(PWD)":/bib \
		-w /bib \
		node:8 \
		sh -c "npm install -g prettier; prettier --write *.js"

serve:
	docker run -it --rm \
		-v "$(PWD)":/bib \
		-w /bib \
		-p 8080:8080 \
		-p 8000:8000 \
		node:8 \
		sh -c "npm install; npm start"

deploy:
	docker run -it --rm \
		-v $(PWD):/bib \
		-w /bib \
		node:8 \
		sh -c "bash"
