#!/usr/bin/env python3
"""Add 'Example' column with Swedish example sentences to verbs.csv and vocabulary.csv."""

import csv, sys

# ── Verb sentences ────────────────────────────────────────────────────────────
# Keys = Infinitiv value from CSV.  Sentence must contain the Presens form
# exactly (used for blanking in the fill-in-the-blank exercise).
# NO COMMAS allowed – the app CSV parser splits on every comma.
VERB_SENTENCES = {
    'vara':           'Det är viktigt att ha bra vänner.',
    'ha':             'Jag har en katt hemma.',
    'göra':           'Vad gör du på helgerna?',
    'säga':           'Hon säger alltid sanningen.',
    'kunna':          'Jag kan simma ganska bra.',
    'få':             'Du får äta kakan nu.',
    'gå':             'Vi går till parken varje morgon.',
    'komma':          'Han kommer snart hem från jobbet.',
    'se':             'Jag ser en fågel utanför fönstret.',
    'ta':             'Hon tar bussen till jobbet.',
    'bli':            'Det blir kallt på kvällen.',
    'ge':             'Han ger henne en blomma.',
    'veta':           'Jag vet inte svaret på den frågan.',
    'tänka':          'Hon tänker på sin familj varje dag.',
    'känna':          'Jag känner mig glad idag.',
    'låta':           'Musiken låter vacker i det stora rummet.',
    'hålla':          'Han håller i sin mammas hand.',
    'leva':           'Vi lever ett enkelt liv på landet.',
    'fråga':          'Han frågar alltid om hjälp när han behöver det.',
    'ställa':         'Läraren ställer en svår fråga till klassen.',
    'visa':           'Hon visar sina foton från semestern.',
    'spela':          'Han spelar gitarr varje kväll.',
    'tro':            'Jag tror att det kommer att gå bra.',
    'ligga':          'Boken ligger på bordet.',
    'stå':            'Han står utanför dörren och väntar.',
    'tycka':          'Jag tycker om att läsa böcker.',
    'mena':           'Vad menar du med det?',
    'sätta':          'Hon sätter nyckeln på bordet.',
    'hitta':          'Jag hittar alltid mina nycklar i jackan.',
    'behöva':         'Du behöver inte oroa dig för det.',
    'börja':          'Skolan börjar klockan åtta varje morgon.',
    'försöka':        'Han försöker lära sig svenska varje dag.',
    'använda':        'Jag använder dator på jobbet.',
    'hjälpa':         'Hon hjälper sin mamma med matlagningen.',
    'tala':           'Han talar tre språk flytande.',
    'följa':          'Hunden följer sin ägare överallt.',
    'lämna':          'Han lämnar huset klockan sju varje morgon.',
    'träffa':         'Jag träffar mina vänner på helgerna.',
    'skriva':         'Hon skriver en roman om sin barndom.',
    'läsa':           'Han läser en bok varje kväll.',
    'verka':          'Det verkar som att det ska bli regn idag.',
    'delta':          'Han deltar i ett projekt på jobbet.',
    'ändra':          'Programmet ändrar automatiskt alla inställningar.',
    'fortsätta':      'Hon fortsätter att studera trots svårigheterna.',
    'höra':           'Jag hör musik från grannen.',
    'öppna':          'Han öppnar fönstret för att vädra.',
    'stänga':         'Hon stänger dörren försiktigt.',
    'svara':          'Han svarar alltid på mina meddelanden.',
    'möta':           'Vi möter våra nya grannar imorgon.',
    'hyra':           'Hon hyr en lägenhet i centrala Stockholm.',
    'köra':           'Han kör bil till jobbet varje dag.',
    'ringa':          'Hon ringer sin mamma varje söndag.',
    'sluta':          'Arbetet slutar klockan fem.',
    'sitta':          'Han sitter vid datorn hela dagen.',
    'äta':            'Vi äter frukost klockan sju.',
    'dricka':         'Hon dricker kaffe varje morgon.',
    'sova':           'Barnet sover i åtta timmar varje natt.',
    'springa':        'Han springer fem kilometer varje morgon.',
    'resa':           'Hon reser till Paris nästa vecka.',
    'glömma':         'Jag glömmer alltid var jag lägger mina nycklar.',
    'vinna':          'Laget vinner matchen med tre mål.',
    'förlora':        'Han förlorar alltid när vi spelar schack.',
    'betala':         'Hon betalar räkningarna i tid.',
    'köpa':           'Han köper bröd på affären varje morgon.',
    'sälja':          'Hon säljer handgjorda smycken online.',
    'tjäna':          'Han tjänar bra på sitt nya jobb.',
    'gilla':          'Jag gillar verkligen din nya frisyr.',
    'älska':          'Hon älskar sin familj över allt annat.',
    'bo':             'Han bor i en liten stad nära havet.',
    'kolla':          'Hon kollar alltid vädret innan hon åker ut.',
    'skratta':        'Han skrattar alltid åt hennes skämt.',
    'åka':            'Vi åker tåg till Göteborg imorgon.',
    'bygga':          'Han bygger ett hus med hjälp av sina vänner.',
    'studera':        'Hon studerar medicin vid universitetet.',
    'prata':          'Vi pratar svenska hemma.',
    'sjunga':         'Barnen sjunger en sång i skolan.',
    'laga':           'Hon lagar mat till hela familjen.',
    'måla':           'Han målar ett porträtt av sin dotter.',
    'förstöra':       'Han förstör alltid stämningen på festen.',
    'bestämma':       'Vi bestämmer vart vi ska åka på semester.',
    'planera':        'Hon planerar bröllopsresan noggrant.',
    'förklara':       'Läraren förklarar grammatiken på ett tydligt sätt.',
    'förstå':         'Jag förstår inte vad han menar.',
    'vänta':          'Han väntar på tåget vid perrongen.',
    'arbeta':         'Hon arbetar på ett stort företag i stan.',
    'skicka':         'Han skickar ett paket till sin familj.',
    'vända':          'Hon vänder sig om när hon hör sitt namn.',
    'kasta':          'Han kastar bollen till sin kompis.',
    'titta':          'Hon tittar på sin favoritserie varje kväll.',
    'klara':          'Han klarar av svåra uppgifter på jobbet.',
    'röra':           'Han rör soppan tills den är varm.',
    'bära':           'Han bär tung utrustning på vandringen.',
    'välja':          'Hon väljer alltid den friskaste maten i butiken.',
    'växa':           'Barnet växer väldigt fort i år.',
    'skapa':          'Konstnären skapar ett nytt konstverk varje vecka.',
    'erbjuda':        'Företaget erbjuder bra lön och förmåner.',
    'bjuda':          'Han bjuder alltid sina vänner på middag.',
    'räkna':          'Barnet räknar till hundra.',
    'leta':           'Hon letar efter sin förlorade katt.',
    'nå':             'Han når sin dröm efter många år.',
    'passa':          'Den blå klänningen passar perfekt till festen.',
    'utveckla':       'Företaget utvecklar ny teknik.',
    'föreslå':        'Han föreslår en ny lösning på problemet.',
    'sakna':          'Jag saknar min familj när jag reser bort.',
    'jämföra':        'Hon jämför priserna på olika webbplatser.',
    'räcka':          'Det räcker med en kopp kaffe för att vakna.',
    'bruka':          'Jag brukar gå till gym på morgnarna.',
    'lägga':          'Han lägger böckerna på hyllan.',
    'le':             'Hon ler alltid mot sina grannar.',
    'kosta':          'Den nya telefonen kostar mycket pengar.',
    'besöka':         'Vi besöker mormor varje jul.',
    'somna':          'Barnet somnar genast när vi sätter på musik.',
    'googla':         'Hon googlar svaret på frågan direkt.',
    'swisha':         'Han swishar pengarna direkt till sin vän.',
    'vilja':          'Jag vill lära mig svenska flytande.',
    'måste':          'Hon måste arbeta extra i helgen.',
    '–':              'Du bör komma i tid till mötet.',
    'lyssna':         'Han lyssnar på musik när han joggar.',
    'jobba':          'Hon jobbar hemifrån på fredagarna.',
    'dö':             'Blommorna dör om man glömmer att vattna dem.',
    'hoppas':         'Jag hoppas att vi vinner matchen.',
    'minnas':         'Jag minns fortfarande den dagen väldigt tydligt.',
    'lära (sig)':     'Hon lär sig ett nytt recept varje vecka.',
    'flytta':         'De flyttar till en ny stad nästa år.',
    'orka':           'Jag orkar inte lyfta den tunga lådan.',
    'beställa':       'Han beställer mat online istället för att laga det.',
    'hinna':          'Jag hinner inte med tåget om jag inte skyndar.',
    'hämta':          'Hon hämtar barnen från skolan klockan tre.',
    'leda':           'Hon leder ett stort projekt på arbetet.',
    'tappa':          'Han tappar alltid sin mobiltelefon.',
    'spara':          'Hon sparar pengar för att köpa en ny bil.',
    'låna':           'Han lånar böcker på biblioteket varje vecka.',
    'betyda':         'Vad betyder det här ordet på svenska?',
    'erkänna':        'Han erkänner att han hade gjort ett misstag.',
    'ladda':          'Hon laddar sin telefon varje kväll.',
    'påverka':        'Vädret påverkar mitt humör.',
    'förändra':       'Resan förändrar mitt perspektiv på livet.',
    'leverera':       'Företaget levererar paketet inom tre dagar.',
    'publicera':      'Hon publicerar en ny artikel varje månad.',
    'söka':           'Han söker ett nytt jobb.',
    'undvika':        'Hon undviker söta drycker för sin hälsa.',
    'uppleva':        'Vi upplever ett fantastiskt äventyr.',
    'förbereda':      'Hon förbereder middagen redan på morgonen.',
    'kontrollera':    'Han kontrollerar alltid bilen innan en lång resa.',
    'undersöka':      'Läkaren undersöker patienten noggrant.',
    'meddelar':       'Hon meddelar sina kollegor om ändringen.',
    'ta hand om':     'Hon tar hand om sina äldre föräldrar.',
    'hålla koll':     'Han håller koll på alla sina utgifter.',
    'byta':           'Hon byter jobb vartannat år.',
    'känna igen':     'Jag känner igen den melodin från filmen.',
    'se ut':          'Hon ser ut att vara trött idag.',
    'låta bekant':    'Det låter bekant men jag minns inte varifrån.',
    'gå åt rätt håll':'Projektet går åt rätt håll trots de tidiga problemen.',
    'upphitta':       'Polisen upphittar den försvunna bilen.',
    'såga':           'Han sågar ner det gamla trädet i trädgården.',
    'snickra':        'Han snickrar en bokhylla i garaget.',
    'mäta':           'Hon mäter rummet innan de köper möbler.',
    'landa':          'Planet landar precis i tid.',
    # duplicates / fallback
    'informera':      'Läraren informerar klassen om schemat.',
}

# ── Vocab category templates ──────────────────────────────────────────────────
# {word} will be replaced with the Swedish word.
# Must produce sentences with NO COMMAS.
CAT_TEMPLATES = {
    'food':         'Jag äter {word} till frukost.',
    'animals':      'En {word} lever ute i naturen.',
    'colors':       'Min favoritfärg är {word}.',
    'body':         'Min {word} gör ont idag.',
    'clothing':     'Hon hade en fin {word} på sig.',
    'furniture':    'Det finns en {word} i vardagsrummet.',
    'health':       '{word} är viktigt för god hälsa.',
    'family':       'Min {word} bor i Stockholm.',
    'numbers':      '{word} är ett tal på svenska.',
    'time':         'Mötet varar i en {word}.',
    'weather':      'Det är {word} ute idag.',
    'transport':    'Vi åker med {word} till stan.',
    'places':       'Vi besökte {word} på semestern.',
    'emotions':     'Jag kände {word} när jag hörde nyheten.',
    'work':         'Det är viktigt att trivas på sin {word}.',
    'profession':   'Han jobbar som {word} på sjukhuset.',
    'technology':   'Jag använder {word} varje dag.',
    'hobbies':      'Min hobby är {word}.',
    'music':        'Jag spelar {word} på fritiden.',
    'sports':       'Vi spelar {word} på lördagarna.',
    'nature':       'En {word} syns ute i naturen.',
    'travel':       'Vi bokade en resa med {word}.',
    'school':       'Imorgon har jag prov i {word}.',
    'science':      'Vi studerar {word} på universitetet.',
    'economy':      '{word} är viktigt för ekonomin.',
    'politics':     '{word} är en del av demokratin.',
    'society':      '{word} spelar en viktig roll i samhället.',
    'adjectives':   'Han är väldigt {word}.',
    'basic':        '{word} är ett vanligt ord på svenska.',
    'shopping':     'Jag hittade ett fint {word} i affären.',
    'environment':  '{word} påverkar vår planet.',
    'art & culture':'{word} är viktigt inom konst och kultur.',
    'childcare':    'Barnet behöver {word} varje dag.',
    'home':         'Vi renoverar {word} hemma.',
    'kitchen':      'Jag använder {word} när jag lagar mat.',
    'drink':        'Jag dricker {word} varje morgon.',
    'tools':        'Jag använder {word} när jag bygger.',
    'default':      '{word} är ett viktigt ord på svenska.',
}


def process_verbs(inpath, outpath):
    with open(inpath, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = list(reader)

    new_headers = list(headers)
    if 'Example' not in new_headers:
        new_headers.append('Example')

    for row in rows:
        inf = row.get('Infinitiv', '').strip()
        sentence = VERB_SENTENCES.get(inf, '')
        if not sentence:
            # fallback: simple generic sentence using the presens form
            pres = row.get('Presens', '').strip()
            if pres and pres != '–':
                sentence = f'Jag {pres} det varje dag.'
        # Safety check: no commas
        sentence = sentence.replace(',', '')
        row['Example'] = sentence

    with open(outpath, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=new_headers)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Verbs: wrote {len(rows)} rows -> {outpath}')


def process_vocab(inpath, outpath):
    with open(inpath, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        rows = list(reader)

    new_headers = list(headers)
    if 'Example' not in new_headers:
        new_headers.append('Example')

    for row in rows:
        sw = row.get('Swedish', '').strip()
        cat = row.get('Category', '').strip().lower()
        template = CAT_TEMPLATES.get(cat, CAT_TEMPLATES['default'])
        sentence = template.format(word=sw)
        # Safety check: no commas
        sentence = sentence.replace(',', '')
        row['Example'] = sentence

    with open(outpath, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=new_headers)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Vocab: wrote {len(rows)} rows -> {outpath}')


if __name__ == '__main__':
    base = '/home/enrico/Documents/Swedish/Apps/webApp'
    process_verbs(f'{base}/verbs.csv', f'{base}/verbs.csv')
    process_vocab(f'{base}/vocabulary.csv', f'{base}/vocabulary.csv')
    print('Done.')
