"""What the TomTom integration is made of: its names, the kinds of report,
the search modes, and every option an entry can carry.

Everything comes from TomTom's own APIs - Traffic Incident Details for the
reports of an area, Routing for a live route and the reports on it,
Geocoding for the addresses a route is set up with, and the Traffic Flow
tiles the card lays over its map. One key covers all of them; see api.py
for how it is kept.
"""

from homeassistant.const import ATTR_LATITUDE, ATTR_LONGITUDE

DOMAIN = "tomtom"

# TomTom's icon categories, by the key everything here calls them. The
# numbers are the API's own ("iconCategory", Traffic Incident Details v5);
# 12 and 13 do not exist in that API. One list, every kind on its own
# switch: an entry about a commute may want the jams and the closures and
# nothing of the weather, an entry about a mountain pass the reverse.
CONF_CATEGORIES = "categories"
TOMTOM_CATEGORIES = {
    "jam": 6,
    "lane_closed": 7,
    "road_closed": 8,
    "road_works": 9,
    "accident": 1,
    "broken_down_vehicle": 14,
    "dangerous_conditions": 3,
    "fog": 2,
    "rain": 4,
    "ice": 5,
    "wind": 10,
    "flooding": 11,
    "unknown": 0,
}
# The kinds a further source adds - see sources.py - under numbers of
# their own above TomTom's: what blitzer.de reports, by what is measured.
# Nothing a source has in common with TomTom is taken from it, so no
# report stands in the list twice.
SOURCE_CATEGORIES = {
    "camera_fixed": 101,
    "camera_mobile": 102,
    "camera_trailer": 103,
    "camera_redlight": 104,
    "camera_section": 105,
    "check_distance": 106,
    "check_police": 107,
    "police_report": 108,
}
CATEGORIES = {**TOMTOM_CATEGORIES, **SOURCE_CATEGORIES}
# The same table the other way round, for deciding what an arriving
# incident is.
CATEGORY_KEYS = {code: key for key, code in CATEGORIES.items()}

# What each category is called, in the two languages the integration
# speaks - the kind's name the sensors, the events and the card's rows use;
# TomTom's own wording of a report comes beside it, in "description".
CATEGORY_LABELS = {
    "jam": {"en": "Traffic jam", "ar": "ازدحام مروري", "ca": "Embús", "cs": "Dopravní zácpa", "da": "Kø", "de": "Stau", "el": "Μποτιλιάρισμα", "es": "Atasco", "et": "Ummik", "fi": "Ruuhka", "fr": "Bouchon", "he": "פקק", "hu": "Forgalmi dugó", "id": "Kemacetan", "it": "Coda", "ja": "渋滞", "ko": "정체", "lt": "Spūstis", "lv": "Sastrēgums", "nb": "Kø", "nl": "File", "pl": "Korek", "pt": "Engarrafamento", "ro": "Ambuteiaj", "ru": "Пробка", "sk": "Dopravná zápcha", "sv": "Kö", "th": "รถติด", "tr": "Trafik sıkışıklığı", "zh-Hant": "塞車"},
    "lane_closed": {"en": "Lane closed", "ar": "حارة مغلقة", "ca": "Carril tallat", "cs": "Uzavřený pruh", "da": "Vognbane spærret", "de": "Fahrstreifen gesperrt", "el": "Κλειστή λωρίδα", "es": "Carril cerrado", "et": "Sõidurada suletud", "fi": "Kaista suljettu", "fr": "Voie fermée", "he": "נתיב חסום", "hu": "Sávlezárás", "id": "Lajur ditutup", "it": "Corsia chiusa", "ja": "車線規制", "ko": "차로 통제", "lt": "Uždaryta eismo juosta", "lv": "Slēgta josla", "nb": "Felt stengt", "nl": "Rijstrook afgesloten", "pl": "Pas zamknięty", "pt": "Via cortada", "ro": "Bandă închisă", "ru": "Полоса закрыта", "sk": "Uzavretý jazdný pruh", "sv": "Körfält avstängt", "th": "ปิดช่องทาง", "tr": "Şerit kapalı", "zh-Hant": "車道封閉"},
    "road_closed": {"en": "Road closed", "ar": "طريق مغلق", "ca": "Carretera tallada", "cs": "Uzavřená silnice", "da": "Vej spærret", "de": "Straße gesperrt", "el": "Κλειστός δρόμος", "es": "Carretera cortada", "et": "Tee suletud", "fi": "Tie suljettu", "fr": "Route barrée", "he": "כביש חסום", "hu": "Útlezárás", "id": "Jalan ditutup", "it": "Strada chiusa", "ja": "通行止め", "ko": "도로 통제", "lt": "Uždarytas kelias", "lv": "Slēgts ceļš", "nb": "Vei stengt", "nl": "Weg afgesloten", "pl": "Droga zamknięta", "pt": "Estrada cortada", "ro": "Drum închis", "ru": "Дорога закрыта", "sk": "Cesta uzavretá", "sv": "Väg avstängd", "th": "ปิดถนน", "tr": "Yol kapalı", "zh-Hant": "道路封閉"},
    "road_works": {"en": "Roadworks", "ar": "أشغال طرق", "ca": "Obres", "cs": "Práce na silnici", "da": "Vejarbejde", "de": "Baustelle", "el": "Οδικά έργα", "es": "Obras", "et": "Teetööd", "fi": "Tietyö", "fr": "Travaux", "he": "עבודות בכביש", "hu": "Útmunkák", "id": "Pekerjaan jalan", "it": "Lavori in corso", "ja": "道路工事", "ko": "도로 공사", "lt": "Kelio darbai", "lv": "Ceļa darbi", "nb": "Veiarbeid", "nl": "Wegwerkzaamheden", "pl": "Roboty drogowe", "pt": "Obras na estrada", "ro": "Lucrări", "ru": "Дорожные работы", "sk": "Práce na ceste", "sv": "Vägarbete", "th": "งานก่อสร้างถนน", "tr": "Yol çalışması", "zh-Hant": "道路施工"},
    "accident": {"en": "Accident", "ar": "حادث", "ca": "Accident", "cs": "Nehoda", "da": "Uheld", "de": "Unfall", "el": "Ατύχημα", "es": "Accidente", "et": "Liiklusõnnetus", "fi": "Onnettomuus", "fr": "Accident", "he": "תאונה", "hu": "Baleset", "id": "Kecelakaan", "it": "Incidente", "ja": "事故", "ko": "사고", "lt": "Avarija", "lv": "Avārija", "nb": "Ulykke", "nl": "Ongeval", "pl": "Wypadek", "pt": "Acidente", "ro": "Accident", "ru": "ДТП", "sk": "Nehoda", "sv": "Olycka", "th": "อุบัติเหตุ", "tr": "Kaza", "zh-Hant": "事故"},
    "broken_down_vehicle": {"en": "Broken down vehicle", "ar": "مركبة معطّلة", "ca": "Vehicle avariat", "cs": "Porouchané vozidlo", "da": "Havareret køretøj", "de": "Liegengebliebenes Fahrzeug", "el": "Ακινητοποιημένο όχημα", "es": "Vehículo averiado", "et": "Rikkis sõiduk", "fi": "Rikkoutunut ajoneuvo", "fr": "Véhicule en panne", "he": "רכב תקוע", "hu": "Lerobbant jármű", "id": "Kendaraan mogok", "it": "Veicolo in panne", "ja": "故障車", "ko": "고장 차량", "lt": "Sugedusi transporto priemonė", "lv": "Sabojājies transportlīdzeklis", "nb": "Havarert kjøretøy", "nl": "Pechgeval", "pl": "Unieruchomiony pojazd", "pt": "Veículo avariado", "ro": "Vehicul în pană", "ru": "Сломавшийся автомобиль", "sk": "Porucha vozidla", "sv": "Stillastående fordon", "th": "รถเสีย", "tr": "Arızalı araç", "zh-Hant": "故障車輛"},
    "dangerous_conditions": {"en": "Dangerous conditions", "ar": "ظروف خطرة", "ca": "Condicions perilloses", "cs": "Nebezpečné podmínky", "da": "Farlige forhold", "de": "Gefährliche Bedingungen", "el": "Επικίνδυνες συνθήκες", "es": "Condiciones peligrosas", "et": "Ohtlikud olud", "fi": "Vaaralliset olosuhteet", "fr": "Conditions dangereuses", "he": "תנאים מסוכנים", "hu": "Veszélyes útviszonyok", "id": "Kondisi berbahaya", "it": "Condizioni pericolose", "ja": "危険な状況", "ko": "위험 상황", "lt": "Pavojingos sąlygos", "lv": "Bīstami apstākļi", "nb": "Farlige kjøreforhold", "nl": "Gevaarlijke omstandigheden", "pl": "Niebezpieczne warunki", "pt": "Condições perigosas", "ro": "Condiții periculoase", "ru": "Опасные условия", "sk": "Nebezpečné podmienky", "sv": "Farliga förhållanden", "th": "สภาพอันตราย", "tr": "Tehlikeli koşullar", "zh-Hant": "路況危險"},
    "fog": {"en": "Fog", "ar": "ضباب", "ca": "Boira", "cs": "Mlha", "da": "Tåge", "de": "Nebel", "el": "Ομίχλη", "es": "Niebla", "et": "Udu", "fi": "Sumu", "fr": "Brouillard", "he": "ערפל", "hu": "Köd", "id": "Kabut", "it": "Nebbia", "ja": "霧", "ko": "안개", "lt": "Rūkas", "lv": "Migla", "nb": "Tåke", "nl": "Mist", "pl": "Mgła", "pt": "Nevoeiro", "ro": "Ceață", "ru": "Туман", "sk": "Hmla", "sv": "Dimma", "th": "หมอก", "tr": "Sis", "zh-Hant": "濃霧"},
    "rain": {"en": "Rain", "ar": "مطر", "ca": "Pluja", "cs": "Déšť", "da": "Regn", "de": "Regen", "el": "Βροχή", "es": "Lluvia", "et": "Vihm", "fi": "Sade", "fr": "Pluie", "he": "גשם", "hu": "Eső", "id": "Hujan", "it": "Pioggia", "ja": "雨", "ko": "비", "lt": "Lietus", "lv": "Lietus", "nb": "Regn", "nl": "Regen", "pl": "Deszcz", "pt": "Chuva", "ro": "Ploaie", "ru": "Дождь", "sk": "Dážď", "sv": "Regn", "th": "ฝนตก", "tr": "Yağmur", "zh-Hant": "降雨"},
    "ice": {"en": "Ice", "ar": "جليد", "ca": "Gel", "cs": "Náledí", "da": "Glat føre", "de": "Glätte", "el": "Πάγος", "es": "Hielo", "et": "Libedus", "fi": "Jäinen tie", "fr": "Verglas", "he": "קרח", "hu": "Jegesedés", "id": "Jalan licin es", "it": "Ghiaccio", "ja": "凍結", "ko": "결빙", "lt": "Plikledis", "lv": "Apledojums", "nb": "Is", "nl": "Gladheid", "pl": "Gołoledź", "pt": "Gelo", "ro": "Polei", "ru": "Гололёд", "sk": "Poľadovica", "sv": "Halka", "th": "น้ำแข็งบนถนน", "tr": "Buzlanma", "zh-Hant": "路面結冰"},
    "wind": {"en": "Wind", "ar": "رياح", "ca": "Vent", "cs": "Vítr", "da": "Vind", "de": "Wind", "el": "Άνεμος", "es": "Viento", "et": "Tuul", "fi": "Tuuli", "fr": "Vent", "he": "רוח", "hu": "Szél", "id": "Angin kencang", "it": "Vento", "ja": "強風", "ko": "강풍", "lt": "Vėjas", "lv": "Vējš", "nb": "Vind", "nl": "Wind", "pl": "Wiatr", "pt": "Vento", "ro": "Vânt", "ru": "Ветер", "sk": "Vietor", "sv": "Vind", "th": "ลมแรง", "tr": "Rüzgar", "zh-Hant": "強風"},
    "flooding": {"en": "Flooding", "ar": "فيضان", "ca": "Inundació", "cs": "Záplavy", "da": "Oversvømmelse", "de": "Überflutung", "el": "Πλημμύρα", "es": "Inundación", "et": "Üleujutus", "fi": "Tulva", "fr": "Inondation", "he": "הצפה", "hu": "Áradás", "id": "Banjir", "it": "Allagamento", "ja": "冠水", "ko": "침수", "lt": "Potvynis", "lv": "Plūdi", "nb": "Oversvømmelse", "nl": "Wateroverlast", "pl": "Podtopienie", "pt": "Inundação", "ro": "Inundație", "ru": "Затопление", "sk": "Záplava", "sv": "Översvämning", "th": "น้ำท่วม", "tr": "Su baskını", "zh-Hant": "淹水"},
    "unknown": {"en": "Unknown", "ar": "غير معروف", "ca": "Desconegut", "cs": "Neznámé", "da": "Ukendt", "de": "Unbekannt", "el": "Άγνωστο", "es": "Desconocido", "et": "Teadmata", "fi": "Tuntematon", "fr": "Inconnu", "he": "לא ידוע", "hu": "Ismeretlen", "id": "Tidak diketahui", "it": "Sconosciuto", "ja": "不明", "ko": "알 수 없음", "lt": "Nežinoma", "lv": "Nezināms", "nb": "Ukjent", "nl": "Onbekend", "pl": "Nieznane", "pt": "Desconhecido", "ro": "Necunoscut", "ru": "Неизвестно", "sk": "Neznáme", "sv": "Okänt", "th": "ไม่ทราบ", "tr": "Bilinmiyor", "zh-Hant": "不明"},
    "camera_fixed": {"en": "Fixed speed camera", "ar": "كاميرا سرعة ثابتة", "ca": "Radar fix", "cs": "Pevný radar", "da": "Fast fartkamera", "de": "Fester Blitzer", "el": "Σταθερή κάμερα ταχύτητας", "es": "Radar fijo", "et": "Statsionaarne kiiruskaamera", "fi": "Kiinteä nopeusvalvontakamera", "fr": "Radar fixe", "he": "מצלמת מהירות קבועה", "hu": "Fix traffipax", "id": "Kamera kecepatan tetap", "it": "Autovelox fisso", "ja": "固定式速度取締機", "ko": "고정식 과속 단속 카메라", "lt": "Stacionarus greičio matuoklis", "lv": "Stacionārs ātruma radars", "nb": "Fast fartskamera", "nl": "Vaste flitser", "pl": "Fotoradar stacjonarny", "pt": "Radar fixo", "ro": "Radar fix", "ru": "Стационарная камера контроля скорости", "sk": "Pevný radar", "sv": "Fast fartkamera", "th": "กล้องตรวจจับความเร็วแบบติดตั้งถาวร", "tr": "Sabit hız kamerası", "zh-Hant": "固定式測速照相"},
    "camera_mobile": {"en": "Mobile speed camera", "ar": "كاميرا سرعة متنقلة", "ca": "Radar mòbil", "cs": "Mobilní radar", "da": "Mobilt fartkamera", "de": "Mobiler Blitzer", "el": "Κινητή κάμερα ταχύτητας", "es": "Radar móvil", "et": "Mobiilne kiiruskaamera", "fi": "Liikkuva nopeusvalvontakamera", "fr": "Radar mobile", "he": "מצלמת מהירות ניידת", "hu": "Mobil traffipax", "id": "Kamera kecepatan bergerak", "it": "Autovelox mobile", "ja": "移動式速度取締機", "ko": "이동식 과속 단속 카메라", "lt": "Mobilusis greičio matuoklis", "lv": "Mobilais ātruma radars", "nb": "Mobilt fartskamera", "nl": "Mobiele flitser", "pl": "Fotoradar mobilny", "pt": "Radar móvel", "ro": "Radar mobil", "ru": "Мобильная камера контроля скорости", "sk": "Mobilný radar", "sv": "Mobil fartkamera", "th": "กล้องตรวจจับความเร็วแบบเคลื่อนที่", "tr": "Mobil hız kamerası", "zh-Hant": "移動式測速照相"},
    "camera_trailer": {"en": "Speed camera trailer", "ar": "مقطورة كاميرا سرعة", "ca": "Radar en remolc", "cs": "Radar na přívěsu", "da": "Fartkameraanhænger", "de": "Anhängerblitzer", "el": "Ρυμουλκούμενη κάμερα ταχύτητας", "es": "Radar en remolque", "et": "Kiiruskaamera haagisel", "fi": "Nopeusvalvontakamera perävaunussa", "fr": "Remorque radar", "he": "נגרר מצלמת מהירות", "hu": "Utánfutós traffipax", "id": "Trailer kamera kecepatan", "it": "Autovelox su rimorchio", "ja": "トレーラー型速度取締機", "ko": "트레일러형 과속 단속 카메라", "lt": "Greičio matuoklio priekaba", "lv": "Ātruma radara piekabe", "nb": "Fartskamera på tilhenger", "nl": "Flitsaanhanger", "pl": "Fotoradar na przyczepie", "pt": "Radar em reboque", "ro": "Radar pe remorcă", "ru": "Камера контроля скорости в прицепе", "sk": "Radar na prívese", "sv": "Fartkamera på släp", "th": "รถพ่วงกล้องตรวจจับความเร็ว", "tr": "Römork hız kamerası", "zh-Hant": "拖車式測速照相"},
    "camera_redlight": {"en": "Red-light camera", "ar": "كاميرا الإشارة الحمراء", "ca": "Radar de semàfor", "cs": "Kamera na červenou", "da": "Rødlyskamera", "de": "Ampelblitzer", "el": "Κάμερα κόκκινου σηματοδότη", "es": "Cámara de semáforo", "et": "Punase tule kaamera", "fi": "Punaisen valon valvontakamera", "fr": "Radar feu rouge", "he": "מצלמת רמזור", "hu": "Piroslámpa-kamera", "id": "Kamera lampu merah", "it": "Telecamera semaforica", "ja": "信号無視取締機", "ko": "신호 위반 단속 카메라", "lt": "Raudonos šviesos kamera", "lv": "Sarkanās gaismas kamera", "nb": "Rødlyskamera", "nl": "Roodlichtcamera", "pl": "Kamera na czerwone światło", "pt": "Radar de semáforo", "ro": "Cameră de semafor", "ru": "Камера на красный свет", "sk": "Kamera na červenú", "sv": "Rödljuskamera", "th": "กล้องตรวจจับการฝ่าไฟแดง", "tr": "Kırmızı ışık kamerası", "zh-Hant": "闖紅燈照相"},
    "camera_section": {"en": "Section control", "ar": "مراقبة السرعة على مقطع", "ca": "Radar de tram", "cs": "Úsekové měření rychlosti", "da": "Strækningskontrol", "de": "Abschnittskontrolle", "el": "Έλεγχος μέσης ταχύτητας", "es": "Radar de tramo", "et": "Keskmise kiiruse mõõtmine", "fi": "Keskinopeusvalvonta", "fr": "Radar tronçon", "he": "אכיפת מהירות ממוצעת", "hu": "Szakaszos sebességmérés", "id": "Kontrol kecepatan ruas", "it": "Controllo velocità media", "ja": "区間速度取締", "ko": "구간 단속", "lt": "Vidutinio greičio matavimas", "lv": "Vidējā ātruma kontrole", "nb": "Strekningsmåling", "nl": "Trajectcontrole", "pl": "Odcinkowy pomiar prędkości", "pt": "Controlo de velocidade média", "ro": "Control de viteză medie", "ru": "Контроль средней скорости", "sk": "Úsekové meranie rýchlosti", "sv": "Sträckmätning", "th": "ตรวจจับความเร็วเฉลี่ยแบบช่วง", "tr": "Ortalama hız denetimi", "zh-Hant": "區間測速"},
    "check_distance": {"en": "Distance check", "ar": "مراقبة مسافة الأمان", "ca": "Control de distància", "cs": "Kontrola odstupu", "da": "Afstandskontrol", "de": "Abstandskontrolle", "el": "Έλεγχος απόστασης", "es": "Control de distancia", "et": "Pikivahe kontroll", "fi": "Turvavälivalvonta", "fr": "Contrôle de distance", "he": "אכיפת שמירת מרחק", "hu": "Követési távolság ellenőrzése", "id": "Pemeriksaan jarak", "it": "Controllo distanza", "ja": "車間距離取締り", "ko": "차간 거리 단속", "lt": "Atstumo patikra", "lv": "Distances pārbaude", "nb": "Avstandskontroll", "nl": "Afstandscontrole", "pl": "Kontrola odstępu", "pt": "Controlo de distância", "ro": "Control de distanță", "ru": "Контроль дистанции", "sk": "Kontrola odstupu", "sv": "Avståndskontroll", "th": "ตรวจระยะห่างระหว่างรถ", "tr": "Takip mesafesi denetimi", "zh-Hant": "車距檢查"},
    "check_police": {"en": "Police check", "ar": "تفتيش شرطة", "ca": "Control policial", "cs": "Policejní kontrola", "da": "Politikontrol", "de": "Polizeikontrolle", "el": "Αστυνομικός έλεγχος", "es": "Control policial", "et": "Politseikontroll", "fi": "Poliisitarkastus", "fr": "Contrôle de police", "he": "ביקורת משטרה", "hu": "Rendőri ellenőrzés", "id": "Razia polisi", "it": "Controllo di polizia", "ja": "警察の検問", "ko": "경찰 검문", "lt": "Policijos patikra", "lv": "Policijas pārbaude", "nb": "Politikontroll", "nl": "Politiecontrole", "pl": "Kontrola policyjna", "pt": "Controlo policial", "ro": "Control polițienesc", "ru": "Полицейская проверка", "sk": "Policajná kontrola", "sv": "Poliskontroll", "th": "ด่านตรวจของตำรวจ", "tr": "Polis denetimi", "zh-Hant": "警察臨檢"},
    "police_report": {"en": "Police report", "ar": "بلاغ شرطة", "ca": "Avís de la policia", "cs": "Policejní hlášení", "da": "Politimelding", "de": "Polizeimeldung", "el": "Ανακοίνωση αστυνομίας", "es": "Aviso policial", "et": "Politsei teade", "fi": "Poliisin tiedote", "fr": "Message de la police", "he": "הודעת משטרה", "hu": "Rendőrségi közlemény", "id": "Laporan polisi", "it": "Comunicato della polizia", "ja": "警察の交通情報", "ko": "경찰 교통 정보", "lt": "Policijos pranešimas", "lv": "Policijas paziņojums", "nb": "Politimelding", "nl": "Politiebericht", "pl": "Komunikat policji", "pt": "Aviso da polícia", "ro": "Anunț al poliției", "ru": "Сообщение полиции", "sk": "Policajné hlásenie", "sv": "Polismeddelande", "th": "ประกาศจากตำรวจ", "tr": "Polis duyurusu", "zh-Hant": "警方通報"},
}
CATEGORY_ICONS = {
    "jam": "mdi:car-multiple",
    "lane_closed": "mdi:road-variant",
    "road_closed": "mdi:boom-gate",
    "road_works": "mdi:excavator",
    "accident": "mdi:car-emergency",
    "broken_down_vehicle": "mdi:car-wrench",
    "dangerous_conditions": "mdi:alert-octagon",
    "fog": "mdi:weather-fog",
    "rain": "mdi:weather-pouring",
    "ice": "mdi:snowflake-alert",
    "wind": "mdi:weather-windy",
    "flooding": "mdi:home-flood",
    "unknown": "mdi:alert",
    "camera_fixed": "mdi:cctv",
    "camera_mobile": "mdi:speedometer",
    "camera_trailer": "mdi:truck-trailer",
    "camera_redlight": "mdi:traffic-light",
    "camera_section": "mdi:ray-start-end",
    "check_distance": "mdi:map-marker-distance",
    "check_police": "mdi:police-badge",
    "police_report": "mdi:bullhorn",
}

# The further sources of reports, each switched on under the settings
# entry's Configure -> Data sources. blitzer.de: no key, no account - and
# no published API either; it reads what the site's own map reads.
SOURCE_BLITZER = "blitzer"
CONF_SOURCE_BLITZER = "source_blitzer"
# Lufop: a documented API with a free personal key, scoped to one country
# a request - the free plan answers France, Belgium and Switzerland.
SOURCE_LUFOP = "lufop"
CONF_SOURCE_LUFOP = "source_lufop"
CONF_LUFOP_API_KEY = "lufop_api_key"
CONF_LUFOP_COUNTRY = "lufop_country"

# The kinds both further sources answer. Each carries a switch per source
# below it in the form, so an entry can leave Lufop out of a kind while
# blitzer.de still reports it - or the other way round.
SHARED_SOURCE_KINDS = ("camera_fixed", "camera_mobile", "camera_redlight", "camera_section")


def source_flag(kind: str, source: str) -> str:
    """The switch of one source under one shared kind."""
    return f"{kind}_{source}"


# Every switch of the kinds list, in the form's order: the kind, and below
# a shared one its two sources. On by default, all of them: an entry is
# about what is on the road, and the form lets each one be switched off.
CATEGORY_DEFAULTS: dict[str, bool] = {}
for _kind in CATEGORIES:
    CATEGORY_DEFAULTS[_kind] = True
    if _kind in SHARED_SOURCE_KINDS:
        CATEGORY_DEFAULTS[source_flag(_kind, SOURCE_BLITZER)] = True
        CATEGORY_DEFAULTS[source_flag(_kind, SOURCE_LUFOP)] = True
# The kinds list of the form: everything but the shared kinds, which sit
# below it as a section each with a switch per source. A shared kind is on
# when either of its sources is.
LIST_KIND_DEFAULTS = {key: True for key in CATEGORIES if key not in SHARED_SOURCE_KINDS}
LUFOP_COUNTRIES = [
    "ad", "au", "be", "bg", "ca", "cz", "fi", "fr", "de", "ie",
    "it", "lv", "lu", "ma", "nl", "nz", "no", "pl", "pt", "es",
    "se", "ch", "ae", "gb",
]

# How a route's traffic sections name what they run through, and the
# category it stands for. "OTHER" is told by the section's TPEG-TEC cause
# - the main cause code, which is the one list TomTom shares with the
# traffic bulletins: 1 congestion, 2 accident, 3 roadworks, 4 narrow
# lanes, 6 slippery road, 7 aquaplaning, 8 fire, 9 hazardous driving
# conditions, 13 broken down vehicle, 17 extreme weather, 18 visibility
# reduced, 19 precipitation, 27 dangerous end of queue.
SECTION_CATEGORIES = {"JAM": 6, "ROAD_WORK": 9, "ROAD_CLOSURE": 8}
CAUSE_CATEGORIES = {
    1: 6, 27: 6, 2: 1, 3: 9, 4: 7, 5: 8, 6: 5, 7: 4, 8: 3, 9: 3, 10: 3,
    11: 3, 12: 3, 13: 14, 14: 3, 15: 1, 17: 3, 18: 2, 19: 4, 26: 6,
}

# How bad the delay is, by TomTom's "magnitudeOfDelay": 0 unknown, 1 minor,
# 2 moderate, 3 major, 4 undefined - the last one is what a road closure and
# every other delay without an end carries.
MAGNITUDE_KEYS = {0: "unknown", 1: "minor", 2: "moderate", 3: "major", 4: "indefinite"}
MAGNITUDE_LABELS = {
    "unknown": {"en": "", "ar": "", "ca": "", "cs": "", "da": "", "de": "", "el": "", "es": "", "et": "", "fi": "", "fr": "", "he": "", "hu": "", "id": "", "it": "", "ja": "", "ko": "", "lt": "", "lv": "", "nb": "", "nl": "", "pl": "", "pt": "", "ro": "", "ru": "", "sk": "", "sv": "", "th": "", "tr": "", "zh-Hant": ""},
    "minor": {"en": "minor", "ar": "طفيف", "ca": "lleu", "cs": "malé", "da": "mindre", "de": "gering", "el": "μικρή", "es": "leve", "et": "väike", "fi": "vähäinen", "fr": "mineur", "he": "קל", "hu": "kisebb", "id": "ringan", "it": "lieve", "ja": "軽微", "ko": "경미", "lt": "nedidelis", "lv": "neliels", "nb": "liten", "nl": "gering", "pl": "niewielkie", "pt": "ligeiro", "ro": "minor", "ru": "небольшая", "sk": "malé", "sv": "liten", "th": "เล็กน้อย", "tr": "hafif", "zh-Hant": "輕微"},
    "moderate": {"en": "moderate", "ar": "متوسط", "ca": "moderat", "cs": "střední", "da": "moderat", "de": "mäßig", "el": "μέτρια", "es": "moderado", "et": "mõõdukas", "fi": "kohtalainen", "fr": "modéré", "he": "בינוני", "hu": "közepes", "id": "sedang", "it": "moderato", "ja": "中程度", "ko": "보통", "lt": "vidutinis", "lv": "mērens", "nb": "moderat", "nl": "matig", "pl": "umiarkowane", "pt": "moderado", "ro": "moderat", "ru": "умеренная", "sk": "stredné", "sv": "måttlig", "th": "ปานกลาง", "tr": "orta", "zh-Hant": "中等"},
    "major": {"en": "major", "ar": "شديد", "ca": "greu", "cs": "velké", "da": "større", "de": "erheblich", "el": "μεγάλη", "es": "grave", "et": "suur", "fi": "merkittävä", "fr": "majeur", "he": "חמור", "hu": "jelentős", "id": "berat", "it": "grave", "ja": "重大", "ko": "심각", "lt": "didelis", "lv": "liels", "nb": "stor", "nl": "ernstig", "pl": "poważne", "pt": "grave", "ro": "major", "ru": "серьёзная", "sk": "veľké", "sv": "stor", "th": "รุนแรง", "tr": "ciddi", "zh-Hant": "嚴重"},
    "indefinite": {"en": "indefinite", "ar": "غير محدد", "ca": "indefinit", "cs": "neurčité", "da": "ubestemt", "de": "unbestimmt", "el": "απροσδιόριστη", "es": "indefinido", "et": "määramata", "fi": "määrittämätön", "fr": "indéterminé", "he": "לא מוגדר", "hu": "meghatározatlan", "id": "tidak tentu", "it": "indefinito", "ja": "期間未定", "ko": "무기한", "lt": "neapibrėžtas", "lv": "nenoteikts", "nb": "ubestemt", "nl": "onbepaald", "pl": "nieokreślone", "pt": "indefinido", "ro": "nedefinit", "ru": "неопределённая", "sk": "neurčité", "sv": "obestämd", "th": "ไม่มีกำหนด", "tr": "belirsiz", "zh-Hant": "未定"},
}

# How sure TomTom is that the incident is there: "certain", "probable",
# "risk_of" or "improbable". The "only certain" filter keeps the first two.
CERTAIN_PROBABILITIES = ("certain", "probable")

# What a request for the reports costs, and may be: one Incident Details
# call per box, a box of at most 10,000 km² (TomTom's limit on the bbox),
# which is a square 100 km on a side - a radius of 50 km. Larger searches
# are split into boxes of at most this size.
MAX_BOX_AREA_KM2 = 10_000.0
MAX_AREA_RADIUS_M = 50_000

# How many reports an entry keeps as entities: the nearest ones. 20.
DEFAULT_COUNT = 20
# Comma-separated road numbers an entry is limited to ("A8, A99, B2"),
# matched against the incident's own road numbers; and comma-separated
# incident ids to leave out.
CONF_ROADS = "roads"
CONF_BLACKLIST = "blacklist"
# Only incidents TomTom is sure of - "certain" and "probable". Off, the
# "risk_of" and "improbable" ones come along too.
CONF_ONLY_CERTAIN = "only_certain"
# A jam is reported from this many minutes of delay; 0 reports every jam.
CONF_JAM_MIN_DELAY = "jam_min_delay"
DEFAULT_JAM_MIN_DELAY = 0

# Fired once per report that is newly reported for an entry - never for one
# already known from an earlier poll, and never during the very first sync
# right after setup. See geo_location.py's _sync_entities.
EVENT_NEW_REPORT = f"{DOMAIN}_new_report"

CONF_SEARCH_MODE = "search_mode"
SEARCH_MODE_AREA = "area"
# A route's line, thinned out - worked out from the route, stored with the
# entry.
CONF_WAYPOINTS = "waypoints"

# The second search mode: a radius like the area's, but around wherever a
# device tracker currently is rather than around a fixed point. Same fields
# and same behaviour as the area otherwise - only the centre moves.
SEARCH_MODE_TRACKER = "tracker"
CONF_TRACKER = "tracker"
CONF_TRACKER_RADIUS = "tracker_radius"
DEFAULT_TRACKER_RADIUS = 1000

# The third search mode: a route TomTom works out from a start, a
# destination and optional via points - again on every poll, with the
# traffic of the moment, so that the entry can say how long the way takes
# right now. Its reports are the route's own traffic sections - what
# TomTom's routing says the route runs through - looked up in Incident
# Details once per report for the rest of what there is to know; the
# route itself never spends a box request.
SEARCH_MODE_ROUTE_LIVE = "route_live"
ROUTE_MODES = (SEARCH_MODE_ROUTE_LIVE,)
CONF_ROUTE_START = "route_start"
CONF_ROUTE_DESTINATION = "route_destination"
# The switch on a new route's last screen that makes the way back as a
# second entry, and that entry's name. Form fields only - never stored.
CONF_RETURN_ROUTE = "return_route"
CONF_RETURN_NAME = "return_name"
CONF_ROUTE_VIAS = "route_vias"
CONF_ROUTE_DISTANCE = "route_distance"
CONF_ROUTE_DURATION = "route_duration"
PLACE_KIND_ZONE = "zone"
PLACE_KIND_POINT = "point"
PLACE_KIND_ADDRESS = "address"
# A place the card's planner takes off an entity's position - a person, a
# tracker, a zone - read once, when the route is made.
PLACE_KIND_ENTITY = "entity"
# Under TomTom Settings: what a route made on the card starts from, by
# default - an entity whose position is the start, or nothing.
CONF_DEFAULT_START = "default_start"
# The quota warning, kept on the settings entry: whether to warn when an
# API's free tier will not last the month, and from what share of it.
CONF_QUOTA_WARNING = "quota_warning"
CONF_QUOTA_THRESHOLD = "quota_threshold"
# The first warning comes when the month's projection reaches this share of
# a free tier, the second when it reaches all of it - as Lufop's day does.
# 100 until 1.0.3; an installation from before keeps that (see the entry
# migration in __init__.py), a new one starts here.
DEFAULT_QUOTA_THRESHOLD = 80
# Lufop's day, on its own: whether to warn, and from what share of the
# day's requests the first warning comes - the second, when all are used,
# comes with the switch alone.
CONF_LUFOP_QUOTA_WARNING = "lufop_quota_warning"
CONF_LUFOP_QUOTA_THRESHOLD = "lufop_quota_threshold"
DEFAULT_LUFOP_QUOTA_THRESHOLD = 80
# The projection waits for a week of the month: a weekday-and-weekend
# pattern is in it by then, and the first days alone say little.
QUOTA_MIN_DAYS = 7
# TomTom takes up to 150 points per route; far fewer vias than that are
# needed to pin a commute to the road it actually takes.
MAX_ROUTE_VIAS = 20

# Where the key comes from. In the code rather than in the sentence that
# tells someone to go there: a translated string may not carry a URL.
CONF_API_KEY = "api_key"
TOMTOM_SIGNUP_URL = "https://developer.tomtom.com/"
LUFOP_SIGNUP_URL = "https://api.lufop.net/"

# When a live route is kept up to date: the weekdays, and the time of day
# from one to the other. Outside those hours the entry does not poll at all
# until a refresh action asks; a commute needs no requests at night. No day
# ticked, or the same time on both ends, means always.
CONF_LIVE_DAYS = "live_days"
CONF_LIVE_FROM = "live_from"
CONF_LIVE_UNTIL = "live_until"
LIVE_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# The way back's own hours, on the form that creates both entries. Form
# fields only; the return entry stores them as its CONF_LIVE_FROM / UNTIL.
CONF_LIVE_BACK_FROM = "live_back_from"
CONF_LIVE_BACK_UNTIL = "live_back_until"
# Fired when a live route's fastest way becomes a different one - after
# the first route of a run, which is only ever the start of knowing.
EVENT_ROUTE_CHANGED = f"{DOMAIN}_route_changed"

# The one entry that is not a search: "TomTom Settings", made by the
# integration itself alongside the first real entry. It carries the
# installation's request totals on the "TomTom General" device, and its
# Configure changes the key. Removed again with the last real entry.
SEARCH_MODE_SETTINGS = "settings"
SETTINGS_UNIQUE_ID = "tomtom_settings"
SETTINGS_TITLE = "TomTom Settings"
# In front of the settings entry's title, which puts it first on the
# integrations page in every language - see _settings_title.
SETTINGS_GEAR = "⚙"



def tracker_position(state) -> tuple[float, float] | None:
    """What a device tracker is reporting as its position, or None.

    The single place that decides whether a tracker can centre a radius, so
    that the two questions asking it cannot end up disagreeing: which
    trackers the config flow offers, and whether a poll has somewhere to
    search.
    """
    if state is None:
        return None
    try:
        return (
            float(state.attributes[ATTR_LATITUDE]),
            float(state.attributes[ATTR_LONGITUDE]),
        )
    except (KeyError, TypeError, ValueError):
        return None


# How often this entry polls TomTom, in minutes. 0 means "never
# automatically", relying entirely on the "refresh" action instead. The
# default is an hour, and it is the number to watch on an area: every poll
# is one request to Incident Details, which has 2,500 free a month, about
# three an hour across every entry of the installation. A live route polls
# Routing instead, which has 20,000, and only inside its hours.
CONF_UPDATE_INTERVAL = "update_interval"
DEFAULT_UPDATE_INTERVAL = 60
UPDATE_INTERVAL_MANUAL = 0
# What a free key has a month, per API - TomTom's free tier as its
# pricing page lists it. The forms measure what an entry costs against the
# Incident Details' figure, and the totals' sensors carry each as an
# attribute beside the count.
FREE_INCIDENT_REQUESTS = 2500
# What a source's free plan allows a day - Lufop's 200 - held against a
# count that starts again every day, beside the monthly ones above.
FREE_TIER_DAY = {
    "lufop": 200,
}
FREE_TIER = {
    "incidents": FREE_INCIDENT_REQUESTS,
    "routing": 20000,
    "geocoding": 20000,
    "reverse_geocoding": 20000,
    # The suggestions while an address is typed on the card's planner:
    # TomTom's Search API, with a tier of its own.
    "search": 2500,
    "tiles": 200000,
}

# How long a report counts as new, in minutes - for the `new` attribute on
# the count sensor and the NEW badge on the card. 0 switches the count off
# rather than reporting a permanent zero. Settable in the entry's options
# and on the entry's own device page - see number.py.
CONF_NEW_MINUTES = "new_minutes"
DEFAULT_NEW_MINUTES = 60

# One action: the route first, then the reports, in one go.
SERVICE_REFRESH = "refresh"
ATTR_CONFIG_ENTRY_ID = "config_entry_id"

# The traffic flow the card lays over its map: TomTom's raster flow tiles,
# served through this integration so the key never reaches a browser. The
# styles TomTom offers; "relative0" is the one it recommends, and the one
# the card draws by default.
FLOW_STYLES = ("relative0", "relative0-dark", "absolute", "relative", "relative-delay", "reduced-sensitivity")
DEFAULT_FLOW_STYLE = "relative0"
FLOW_TILE_URL_BASE = f"/{DOMAIN}_tiles"
