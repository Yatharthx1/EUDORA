FROM python:3.11-slim        # base image to start from

RUN apt-get install -y git   # run a shell command

WORKDIR /app                 # set working directory

COPY requirements.txt .      # copy file from your computer → container

RUN pip install -r requirements.txt

COPY . .                     # copy everything else

EXPOSE 7860                  # open this port

CMD ["uvicorn", "main:app"]  # command to run when container starts