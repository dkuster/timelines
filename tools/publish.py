#!/usr/bin/env python3
"""publish — publie le site complet (accueil, frise de bureau, viewer mobile) par FTP.

Destination : https://dkinformatique.ch/timeline/ (la racine du compte FTP).
Paramètres de connexion lus dans specs/ftp.md (lignes « server : », « user : »,
« password : », et facultativement « dossier : » pour un sous-dossier distant).
Les variables d'environnement TLDB_FTP_SERVER, TLDB_FTP_USER, TLDB_FTP_PASSWORD
et TLDB_FTP_DIR les remplacent si elles existent. Le mot de passe n'est jamais affiché.

Ce qui est publié : tout le dossier viewer/ (pages, i18n.js, data.js pour la frise,
data-mobile.js pour le mobile, sw.js, manifest, icônes, .htaccess), sauf les fichiers
listés dans EXCLUDE, plus le dossier media/ (fichiers locaux) sous media/.

Déroulement :
  1. regénère viewer/data.js, data-mobile.js et la version de sw.js (build_viewer.py) ;
  2. envoie les fichiers modifiés depuis la dernière publication (empreintes dans
     tools/.publish-state.json) ; chaque fichier est d'abord écrit sous un nom
     temporaire puis renommé, pour qu'un visiteur ne reçoive jamais un fichier tronqué ;
  3. ordre d'envoi : données et ressources, puis pages HTML, puis .htaccess, et sw.js
     en dernier : les pages ne référencent jamais des données absentes, et les
     téléphones ne voient la nouvelle version qu'une fois tout en place ;
  4. vérifie que le site répond ; si le .htaccess provoque une erreur 500 (hébergeur
     qui n'autorise pas ces directives), il est retiré du serveur aussitôt.

Connexion chiffrée (FTPS explicite) d'abord ; si le serveur la refuse, FTP simple
avec un avertissement (le mot de passe circule alors en clair).

Usage, depuis la racine de la base :
  py tools\\publish.py               build + envoi des fichiers modifiés
  py tools\\publish.py --dry-run     montre ce qui serait envoyé, sans se connecter
  py tools\\publish.py --all         renvoie tout, même ce qui n'a pas changé
  py tools\\publish.py --no-build    n'exécute pas build_viewer.py
  py tools\\publish.py --prune       supprime aussi en ligne les fichiers publiés qui
                                     n'existent plus localement
  py tools\\publish.py --list        liste le contenu distant
  py tools\\publish.py --check       teste la connexion FTP et la réponse du site

Aucune dépendance (bibliothèque standard uniquement).
"""
from __future__ import annotations

import argparse
import fnmatch
import ftplib
import hashlib
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIEWER = ROOT / "viewer"
MEDIA = ROOT / "media"
STATE = ROOT / "tools" / ".publish-state.json"
SITE = "https://dkinformatique.ch/timeline/"

LAST = "sw.js"           # envoyé en dernier
HTACCESS = ".htaccess"   # en-têtes de cache et compression (Apache)
# fichiers de viewer/ à ne pas publier (motifs, chemins relatifs à viewer/) ; ex. "ideas-proto.html"
EXCLUDE: set[str] = set()
SKIP = {".gitkeep", "Thumbs.db", "desktop.ini", ".DS_Store", "*.part", "*.tmp", "*.bak", "*.bak-*", "~$*"}
REFUSED = "refusé:"      # préfixe d'état : fichier retiré du serveur après une erreur


def _skipped(rel: str, extra: set[str] = frozenset()) -> bool:
    name = rel.rsplit("/", 1)[-1]
    return any(fnmatch.fnmatch(name, pat) for pat in SKIP) or any(fnmatch.fnmatch(rel, pat) for pat in extra)


def rank(remote: str) -> int:
    if remote == LAST:
        return 3
    if remote == HTACCESS:
        return 2
    if remote.endswith(".html"):
        return 1
    return 0


def files_to_publish() -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for p in VIEWER.rglob("*"):
        rel = p.relative_to(VIEWER).as_posix()
        if p.is_file() and "__pycache__" not in rel and not _skipped(rel, EXCLUDE):
            out.append((p, rel))
    if MEDIA.exists():
        for p in MEDIA.rglob("*"):
            rel = p.relative_to(MEDIA).as_posix()
            if p.is_file() and not _skipped(rel):
                out.append((p, "media/" + rel))
    required = ["index.html", "desktop.html", "mobile.html", "i18n.js", "data.js", "data-mobile.js", LAST]
    have = {r for _, r in out}
    missing = [r for r in required if r not in have]
    if missing:
        sys.exit("fichiers introuvables dans viewer/ : " + ", ".join(missing))
    return sorted(out, key=lambda t: (rank(t[1]), t[1]))


def read_config() -> dict:
    cfg = {}
    md = ROOT / "specs" / "ftp.md"
    if md.exists():
        text = md.read_text(encoding="utf-8")
        for key, names in {"server": ["server", "serveur", "host"], "user": ["user", "utilisateur", "login"],
                           "password": ["password", "mot de passe", "pass"], "dir": ["dossier", "dir", "directory"]}.items():
            for n in names:
                m = re.search(rf"^\s*[-*]?\s*{re.escape(n)}\s*[:=]\s*`?([^`\s]+)`?\s*$", text, re.M | re.I)
                if m:
                    cfg[key] = m.group(1)
                    break
    for key in ["server", "user", "password", "dir"]:
        v = os.environ.get("TLDB_FTP_" + key.upper())
        if v:
            cfg[key] = v
    for key in ["server", "user", "password"]:
        if not cfg.get(key):
            sys.exit(f"paramètre FTP manquant : {key} (specs/ftp.md ou variable TLDB_FTP_{key.upper()})")
    cfg.setdefault("dir", "/")
    return cfg


def sha1(p: Path) -> str:
    h = hashlib.sha1()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def connect(cfg: dict) -> ftplib.FTP:
    host, port = cfg["server"], 21
    if ":" in host:
        host, port = host.rsplit(":", 1)[0], int(host.rsplit(":", 1)[1])
    try:
        ftp: ftplib.FTP = ftplib.FTP_TLS(timeout=30)
        ftp.connect(host, port)
        ftp.login(cfg["user"], cfg["password"])  # FTP_TLS.login envoie AUTH TLS avant l'identifiant
        ftp.prot_p()
        print(f"connecté à {host} (FTPS chiffré)")
    except (ftplib.error_perm, ssl.SSLError) as e:
        if str(e).startswith("530"):
            sys.exit("identifiant ou mot de passe refusé par le serveur (530)")
        print(f"avertissement : FTPS refusé ({e}) ; connexion FTP non chiffrée (mot de passe en clair)")
        ftp = ftplib.FTP(timeout=30)
        try:
            ftp.connect(host, port)
            ftp.login(cfg["user"], cfg["password"])
        except ftplib.error_perm as e2:
            sys.exit(f"connexion refusée : {e2} (identifiant ou mot de passe ?)")
        except OSError as e2:
            sys.exit(f"connexion impossible à {host}:{port} : {e2}")
        print(f"connecté à {host} (FTP)")
    except OSError as e:
        sys.exit(f"connexion impossible à {host}:{port} : {e}")
    ftp.set_pasv(True)
    if cfg["dir"] not in ("", "/"):
        ftp.cwd(cfg["dir"])
    return ftp


def ensure_dirs(ftp: ftplib.FTP, remote: str, made: set) -> None:
    parts = remote.split("/")[:-1]
    for i in range(1, len(parts) + 1):
        d = "/".join(parts[:i])
        if d in made:
            continue
        try:
            ftp.mkd(d)
        except ftplib.error_perm:
            pass  # existe déjà
        made.add(d)


def upload(ftp: ftplib.FTP, local: Path, remote: str) -> None:
    tmp = remote + ".part"
    with local.open("rb") as f:
        ftp.storbinary("STOR " + tmp, f, blocksize=1 << 16)
    try:
        ftp.delete(remote)
    except ftplib.error_perm:
        pass
    ftp.rename(tmp, remote)


def site_status(path: str) -> int | None:
    """Code HTTP renvoyé par le site pour path (None si le site est injoignable)."""
    url = SITE + path + ("&" if "?" in path else "?") + f"publish={int(time.time())}"
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "tldb-publish"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return None


def human(n: int) -> str:
    return f"{n / 1048576:.1f} Mo" if n >= 1048576 else f"{n / 1024:.0f} Ko"


def save_state(state_all: dict) -> None:
    STATE.write_text(json.dumps(state_all, indent=1, sort_keys=True), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="montrer ce qui serait envoyé, sans se connecter")
    ap.add_argument("--all", action="store_true", help="tout renvoyer")
    ap.add_argument("--no-build", action="store_true", help="ne pas lancer build_viewer.py")
    ap.add_argument("--prune", action="store_true", help="supprimer en ligne les fichiers publiés disparus localement")
    ap.add_argument("--list", action="store_true", help="lister le contenu distant")
    ap.add_argument("--check", action="store_true", help="tester la connexion et la réponse du site")
    args = ap.parse_args()
    try:
        sys.stdout.reconfigure(errors="replace")  # console Windows
    except Exception:
        pass

    cfg = read_config()
    if args.check or args.list:
        ftp = connect(cfg)
        if args.list:
            def walk(d: str, depth: int = 0) -> None:
                try:
                    entries = list(ftp.mlsd(d or "."))
                except ftplib.error_perm:
                    print("  " * depth + "(liste détaillée non disponible)")
                    for n in ftp.nlst(d or "."):
                        print("  " * depth + n)
                    return
                for name, facts in sorted(entries):
                    if name in (".", ".."):
                        continue
                    path = (d + "/" if d else "") + name
                    if facts.get("type") == "dir":
                        print("  " * depth + name + "/")
                        walk(path, depth + 1)
                    else:
                        print("  " * depth + f"{name}  {human(int(facts.get('size', 0)))}")
            walk("")
        else:
            print("répertoire distant :", ftp.pwd())
            for page in ["index.html", "desktop.html", "mobile.html", "data.js"]:
                print(f"  {SITE}{page} : {site_status(page) or 'injoignable'}")
        ftp.quit()
        return 0

    if not args.no_build:
        print("build_viewer.py…", flush=True)
        r = subprocess.run([sys.executable, str(ROOT / "tools" / "build_viewer.py")], cwd=ROOT)
        if r.returncode:
            sys.exit("build_viewer.py a échoué : publication annulée")

    state_all = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    key = f"{cfg['user']}@{cfg['server']}{'' if cfg['dir'] in ('', '/') else '/' + cfg['dir'].strip('/')}"
    state = state_all.setdefault(key, {})

    files = files_to_publish()
    todo = []
    for local, remote in files:
        h = sha1(local)
        if state.get(remote) == REFUSED + h and not args.all:
            print(f"  ({remote} ignoré : retiré après une erreur du serveur ; --all pour réessayer)")
            continue
        if args.all or state.get(remote) != h:
            todo.append((local, remote, h))
    local_set = {r for _, r in files}
    orphans = sorted(r for r in state if r not in local_set)

    if todo:
        total = sum(p.stat().st_size for p, _, _ in todo)
        print(f"{len(todo)} fichier(s) à envoyer ({human(total)}) :")
        for p, r, _ in todo:
            print(f"  {r}  {human(p.stat().st_size)}")
    if orphans:
        verb = "à supprimer en ligne" if args.prune else "publiés mais disparus localement (--prune pour les supprimer)"
        print(f"{len(orphans)} fichier(s) {verb} :")
        for r in orphans:
            print(f"  {r}")
    if not todo and not (orphans and args.prune):
        print("rien à publier : tout est à jour sur", SITE)
        return 0
    if args.dry_run:
        return 0

    ftp = connect(cfg)
    made: set = set()
    t0 = time.time()
    sent: set = set()
    try:
        for local, remote, h in todo:
            ensure_dirs(ftp, remote, made)
            upload(ftp, local, remote)
            state[remote] = h
            sent.add(remote)
            print(f"  ✓ {remote}")
            save_state(state_all)
        if args.prune:
            for r in orphans:
                try:
                    ftp.delete(r)
                    print(f"  ✗ {r} supprimé")
                except ftplib.error_perm as e:
                    print(f"  {r} : déjà absent ({e})")
                state.pop(r, None)
                save_state(state_all)

        # le site répond-il ?
        status = site_status("index.html")
        if status == 500 and HTACCESS in sent:
            ftp.delete(HTACCESS)
            state[HTACCESS] = REFUSED + state[HTACCESS]
            save_state(state_all)
            status = site_status("index.html")
            print(f"avertissement : le serveur refuse viewer/{HTACCESS} (erreur 500) ; fichier retiré du serveur."
                  f" Le site reste fonctionnel, mais sans les réglages de cache et de compression.")
        if status is None:
            print("vérification impossible : le site ne répond pas depuis ce poste")
        elif status != 200:
            print(f"attention : {SITE}index.html répond {status}")
        else:
            bad = [p for p in ("desktop.html", "mobile.html", "data.js", "data-mobile.js") if site_status(p) != 200]
            print("site vérifié" + (f" ; ne répondent pas 200 : {', '.join(bad)}" if bad else ""))
    except ftplib.all_errors as e:
        print(f"erreur pendant l'envoi : {e}")
        print("les fichiers déjà envoyés sont notés ; relancer la commande pour terminer")
        return 1
    finally:
        try:
            ftp.quit()
        except Exception:
            pass
    print(f"publié en {time.time() - t0:.0f} s : {SITE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
