# CSCI334

setup (first time):

```console
$ python3 -m venv .venv
$ source .venv/bin/activate
$ pip install -r backend/requirements.txt
$ python backend/seed.py --reset
```

to run:

```console
$ python backend/app.py
```

Then open http://127.0.0.1:5000/ in your browser
