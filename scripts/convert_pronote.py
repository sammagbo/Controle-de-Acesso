#!/usr/bin/env python3
# =====================================================================
# convert_pronote.py — Conversion Pronote -> format MAGBO Access Control
# =====================================================================
# Convertit un export Pronote (CSV ou XLSX) vers le fichier CSV attendu
# par MAGBO Access Control (12 colonnes, identifiants a 7 chiffres).
#
# UTILISATION :
#   python convert_pronote.py <fichier_pronote.xlsx|.csv> [sortie.csv]
#
# Si le fichier de sortie n'est pas precise, genere "export_pronote.csv"
# dans le dossier courant.
#
# DEPENDANCES : pandas, openpyxl
#   pip install pandas openpyxl
# =====================================================================

import sys
import os

try:
    import pandas as pd
except ImportError:
    print("ERREUR : pandas n'est pas installe. Lancez : pip install pandas openpyxl")
    sys.exit(1)


# Colonnes attendues dans l'export Pronote
COLS = {
    "id": "ID",
    "nom": "NOM",
    "prenom": "PRENOM",
    "classe": "CLASSES",
    "r1_nom": "Responsable1_NOM",
    "r1_prenom": "Responsable1_PRENOM",
    "r1_civ": "Responsable1_CIVILITE",
    "r2_nom": "Responsable2_NOM",
    "r2_prenom": "Responsable2_PRENOM",
    "r2_civ": "Responsable2_CIVILITE",
}

HEADER = ("userId;nome;tipo;turma;responsavelId;responsavelNome;"
          "responsavelParentesco;responsavelTelefone;"
          "responsavel2Id;responsavel2Nome;responsavel2Parentesco;responsavel2Telefone")


def clean(value):
    """Retourne une chaine nettoyee, vide si NaN/None."""
    if pd.isna(value):
        return ""
    return str(value).strip()


def pad7(raw_id):
    """Force l'identifiant a 7 chiffres avec des zeros devant.
    Protege contre Excel qui supprime les zeros initiaux (0003614 -> 3614)."""
    raw = clean(raw_id)
    # garde uniquement les chiffres
    digits = "".join(c for c in raw if c.isdigit())
    if not digits:
        return ""
    return digits.zfill(7)


def main():
    if len(sys.argv) < 2:
        print("UTILISATION : python convert_pronote.py <fichier_pronote.xlsx|.csv> [sortie.csv]")
        sys.exit(1)

    entree = sys.argv[1]
    sortie = sys.argv[2] if len(sys.argv) > 2 else "export_pronote.csv"

    if not os.path.exists(entree):
        print(f"ERREUR : fichier introuvable : {entree}")
        sys.exit(1)

    # Lecture selon l'extension. dtype=str preserve les zeros si CSV.
    ext = os.path.splitext(entree)[1].lower()
    try:
        if ext in (".xlsx", ".xls"):
            df = pd.read_excel(entree, dtype=str)
        elif ext == ".csv":
            # essaie ; puis , comme separateur
            df = pd.read_csv(entree, dtype=str, sep=";")
            if df.shape[1] == 1:
                df = pd.read_csv(entree, dtype=str, sep=",")
        else:
            print(f"ERREUR : extension non supportee : {ext} (attendu .xlsx ou .csv)")
            sys.exit(1)
    except Exception as e:
        print(f"ERREUR a la lecture du fichier : {e}")
        sys.exit(1)

    # Verifie la presence des colonnes essentielles
    manquantes = [c for c in (COLS["id"], COLS["nom"], COLS["prenom"], COLS["classe"]) if c not in df.columns]
    if manquantes:
        print(f"ERREUR : colonnes manquantes dans l'export : {manquantes}")
        print(f"Colonnes trouvees : {list(df.columns)}")
        sys.exit(1)

    lignes = [HEADER]
    ignores = []
    total = 0

    for _, row in df.iterrows():
        user_id = pad7(row.get(COLS["id"]))
        if not user_id:
            # eleve sans identifiant Pronote -> ignore (ex: ancien eleve)
            nom_complet = f"{clean(row.get(COLS['prenom']))} {clean(row.get(COLS['nom']))}".strip()
            ignores.append(nom_complet or "(sans nom)")
            continue

        nome = f"{clean(row.get(COLS['prenom']))} {clean(row.get(COLS['nom']))}".strip()
        turma = clean(row.get(COLS["classe"]))

        # Responsable 1
        r1_nom = clean(row.get(COLS["r1_nom"]))
        r1_prenom = clean(row.get(COLS["r1_prenom"]))
        r1_civ = clean(row.get(COLS["r1_civ"]))
        # Pronote ne fournit PAS d'ID de responsable -> on le genere : R + id eleve
        resp_id = f"R{user_id}" if r1_nom else ""
        resp_nome = f"{r1_prenom} {r1_nom}".strip() if r1_nom else ""

        # Responsable 2 (optionnel)
        r2_nom = clean(row.get(COLS["r2_nom"]))
        r2_prenom = clean(row.get(COLS["r2_prenom"]))
        r2_civ = clean(row.get(COLS["r2_civ"]))
        resp2_id = f"R{user_id}_2" if r2_nom else ""
        resp2_nome = f"{r2_prenom} {r2_nom}".strip() if r2_nom else ""

        lignes.append(
            f"{user_id};{nome};ALUNO;{turma};"
            f"{resp_id};{resp_nome};{r1_civ};;"
            f"{resp2_id};{resp2_nome};{r2_civ};"
        )
        total += 1

    # Ecriture en UTF-8 (sans BOM, le backend lit en UTF-8)
    with open(sortie, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes))

    print(f"OK : {total} eleves convertis -> {sortie}")
    if ignores:
        print(f"\nATTENTION : {len(ignores)} eleve(s) sans identifiant Pronote ignore(s) :")
        for nom in ignores:
            print(f"   - {nom}")
        print("(Ce sont generalement d'anciens eleves. Verifiez si c'est attendu.)")


if __name__ == "__main__":
    main()
