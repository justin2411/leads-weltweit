/* Praxis-Cockpit · Themenbibliothek für Ratgeber-Beiträge
   Fachlich vorsichtig formuliert (keine Heilversprechen, keine Angstwerbung, HWG).
   {ort} wird durch den gewählten Ort ersetzt. */
(function () {
  "use strict";
  window.PC_TOPICS = [
    {
      id: "sturz", title: "Sturzprävention im Alter: sicher bewegen in den eigenen vier Wänden", kw: "sturzprävention senioren", vol: 210, rank: 24, season: [10, 11, 12, 1, 2, 3],
      img: "geriatrie-aufstehen", page: ["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"], link2: ["/gangschule-hausbesuch", "Gangschule"],
      also: ["sturzprophylaxe übungen", "gleichgewichtstraining senioren", "stürze vermeiden zu hause"], intent: "Wissen und Übungen für Betroffene und Angehörige",
      intro: {
        sie: "Ein Sturz kann im Alter vieles verändern. Die gute Nachricht: Mit gezieltem Training lässt sich das Risiko oft verringern, und zwar am besten genau dort, wo Sie sich täglich bewegen. Zu Hause.",
        ang: "Wenn ein Elternteil schon einmal gestürzt ist, sorgen sich Angehörige oft bei jedem Schritt. Gezieltes Training im gewohnten Umfeld kann helfen, wieder mehr Sicherheit zu gewinnen, für beide Seiten."
      },
      body: {
        "Warum Stürze im Alter häufiger werden": ["Mit den Jahren lassen Muskelkraft und Gleichgewicht nach. Dazu kommen manchmal Medikamente, die schwindelig machen, schlechteres Sehen oder Stolperfallen in der Wohnung. Meist ist es das Zusammenspiel mehrerer Gründe.", "Nach einem ersten Sturz entsteht häufig Angst. Wer sich weniger bewegt, verliert weiter an Kraft. Diesen Kreislauf zu unterbrechen, ist ein wichtiges Ziel der Physiotherapie."],
        "Was Physiotherapie im Hausbesuch leisten kann": ["Im Hausbesuch üben wir genau die Wege und Bewegungen, die Sie täglich brauchen: vom Sessel aufstehen, ins Bad gehen, die Treppe nehmen. Kraft und Gleichgewicht trainieren wir so, dass es zu Ihrem Alltag passt.", "Gleichzeitig schauen wir uns gemeinsam die Wohnung an. Lose Teppiche, schlechte Beleuchtung oder fehlende Haltegriffe lassen sich oft mit wenig Aufwand ändern."],
        "Drei einfache Übungen für jeden Tag": ["<ul><li>Aufstehen und Hinsetzen vom Stuhl, zehnmal langsam, mit den Händen auf den Oberschenkeln</li><li>Fersen heben im Stand, mit Halt an der Küchenarbeitsplatte</li><li>Auf einem Bein stehen mit sicherem Halt, je Seite 15 Sekunden</li></ul>", "Bitte üben Sie nur mit sicherem Halt und sprechen Sie neue Übungen vorher mit Ihrer Therapeutin oder Ihrem Therapeuten ab."],
        "Stolperfallen in der Wohnung erkennen": ["Häufige Stolperfallen sind Teppichkanten, Kabel, rutschige Badvorleger und dunkle Flure in der Nacht. Ein Nachtlicht, rutschfeste Unterlagen und ein Haltegriff an der Dusche sind kleine Schritte mit oft großer Wirkung auf das Sicherheitsgefühl."],
        "Wann ein Hausbesuch sinnvoll ist": ["Ein Hausbesuch ist sinnvoll, wenn der Weg in eine Praxis schwerfällt, nach einem Krankenhausaufenthalt oder wenn Unsicherheit beim Gehen den Alltag einschränkt. Wir kommen zu Ihnen {ort}."]
      },
      faq: [["Wie oft sollte ich üben?", "Kurze Einheiten an den meisten Tagen der Woche sind meist besser als selten lange. Wie viel für Sie passt, besprechen wir beim ersten Termin."], ["Brauche ich eine Verordnung?", "Für die Erstattung durch Versicherung oder Beihilfe in der Regel ja. Als Selbstzahler können Sie auch ohne Verordnung starten."]],
      check: ["Teppiche rutschfest oder entfernt", "Nachtlicht im Flur und Bad", "Haltegriffe an Dusche und WC", "Häufig genutzte Dinge in Greifhöhe", "Feste Hausschuhe statt Pantoffeln"]
    },
    {
      id: "hueft", title: "Physiotherapie nach Hüftoperation zu Hause: so gelingt der Start", kw: "physiotherapie nach hüft op zu hause", vol: 140, rank: null, season: [],
      img: "leistung-krankengymnastik", page: ["/krankengymnastik-hausbesuch", "Krankengymnastik im Hausbesuch"], link2: ["/gangschule-hausbesuch", "Gangschule"],
      also: ["hüft tep reha zu hause", "übungen nach hüft op", "gehen mit gehstützen"], intent: "Orientierung nach der Klinik", match: /hüft/i,
      intro: {
        sie: "Nach einer neuen Hüfte zählt jeder Schritt. Physiotherapie im Hausbesuch kann helfen, wieder sicher und selbstständig zu werden, ohne beschwerliche Fahrten in eine Praxis.",
        ang: "Wenn ein Elternteil nach einer Hüftoperation nach Hause kommt, sind die ersten Wochen oft herausfordernd. Physiotherapie im Hausbesuch kann helfen, den Alltag Schritt für Schritt zurückzugewinnen."
      },
      body: {
        "Die ersten Wochen nach der Operation": ["Im Mittelpunkt stehen sichere Bewegungsübergänge, das Gehen mit Gehhilfe und der schrittweise Aufbau der Muskulatur. Wichtig sind die Vorgaben der Klinik zur Belastung, an denen wir uns orientieren."],
        "Warum die Therapie zu Hause Vorteile hat": ["Wir üben genau die Wege, die Sie täglich brauchen: ins Bett, aus dem Sessel, ins Auto und die Stufen zur Haustür. Angehörige können dabei sein und lernen, wie sie unterstützen können, ohne zu viel abzunehmen."],
        "Typische Ziele der Behandlung": ["<ul><li>sicher aufstehen und hinsetzen</li><li>Gehstrecke Schritt für Schritt verlängern</li><li>Treppe mit Geländer meistern</li><li>Gehhilfe nach Absprache reduzieren</li></ul>"],
        "Wie lange dauert die Behandlung?": ["Das ist sehr unterschiedlich. Bei der Mobilen Physiotherapie Oehlke dauert jeder Termin 60 Minuten, damit genug Zeit für Übungen, Fragen und Anleitung bleibt."],
        "Hausbesuch anfragen": ["Wir kommen zu Ihnen {ort}. Für Privatpatienten, Beihilfeberechtigte und Selbstzahler."]
      },
      faq: [["Ab wann kann die Physiotherapie zu Hause beginnen?", "Oft direkt nach der Entlassung aus Klinik oder Reha. Den genauen Zeitpunkt stimmen wir mit den ärztlichen Vorgaben ab."], ["Was muss auf der Verordnung stehen?", "Neben dem Heilmittel sollte der Hausbesuch vermerkt sein, damit Versicherung oder Beihilfe ihn berücksichtigen können."]],
      check: ["Weg vom Bett zum Bad frei", "Erhöhter Toilettensitz bei Bedarf", "Stabile Stühle mit Armlehnen", "Greifzange für den Boden"]
    },
    {
      id: "knie", title: "Nach der Knieprothese: Übungen und Physiotherapie zu Hause", kw: "knie tep physiotherapie zu hause", vol: 170, rank: null, season: [],
      img: "geriatrie-gangtraining", page: ["/krankengymnastik-hausbesuch", "Krankengymnastik im Hausbesuch"], link2: ["/manuelle-therapie-hausbesuch", "Manuelle Therapie"],
      also: ["übungen nach knie op", "knie beugen nach op", "knie tep reha"], intent: "Übungen und Ablauf", match: /knie/i,
      intro: {
        sie: "Ein neues Kniegelenk soll Ihnen wieder mehr Bewegungsfreiheit geben. Damit das gelingt, ist regelmäßiges Üben wichtig. Im Hausbesuch können Sie direkt dort trainieren, wo Sie die Bewegung brauchen.",
        ang: "Nach einer Knieoperation brauchen viele ältere Menschen Unterstützung im Alltag. Physiotherapie im Hausbesuch kann helfen, Beweglichkeit und Sicherheit Schritt für Schritt zurückzugewinnen."
      },
      body: {
        "Was in den ersten Wochen wichtig ist": ["Beweglichkeit, Kraft und ein sicheres Gangbild stehen im Vordergrund. Schwellungen und Schmerzen sind anfangs häufig. Wir passen die Übungen an Ihren Tagesstand und die Vorgaben der Klinik an."],
        "Beweglichkeit und Kraft im Alltag üben": ["Wir trainieren Bewegungen wie Treppensteigen, Aufstehen aus tiefen Sesseln oder das Ein- und Aussteigen ins Auto. So wird die Übung direkt Teil Ihres Alltags."],
        "Einfache Übungen nach Absprache": ["<ul><li>Fußpumpe im Liegen, mehrmals täglich</li><li>Knie im Sitzen langsam beugen und strecken</li><li>Oberschenkelmuskel anspannen, fünf Sekunden halten</li></ul>", "Bitte nur nach Rücksprache mit Ihrer Therapeutin oder Ihrem Therapeuten üben."],
        "Hausbesuch in Ihrer Nähe": ["Wir kommen zu Ihnen {ort}, jeder Termin dauert 60 Minuten."]
      },
      faq: [["Wie lange dauert es, bis das Knie wieder belastbar ist?", "Das ist individuell verschieden und hängt von vielen Faktoren ab. Wir besprechen realistische Zwischenziele gemeinsam."], ["Kann ich auch ohne Auto zur Therapie?", "Ja, genau dafür gibt es den Hausbesuch. Wir kommen zu Ihnen."]],
      check: ["Kühlpacks griffbereit", "Feste Schuhe mit Fersenhalt", "Stuhl mit Armlehnen zum Üben"]
    },
    {
      id: "parkinson", title: "Parkinson: wie Bewegung im Alltag unterstützen kann", kw: "physiotherapie parkinson hausbesuch", vol: 90, rank: null, season: [],
      img: "leistung-gangschule", page: ["/gangschule-hausbesuch", "Gangschule im Hausbesuch"], link2: ["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"],
      also: ["parkinson übungen gehen", "parkinson gangstörung", "parkinson physiotherapie"], intent: "Wissen für Betroffene und Angehörige", match: /parkinson/i,
      intro: {
        sie: "Bei Parkinson verändern sich Bewegungen oft schleichend: kleinere Schritte, Startschwierigkeiten, Unsicherheit beim Drehen. Regelmäßige Physiotherapie kann helfen, Beweglichkeit und Selbstständigkeit möglichst lange zu erhalten.",
        ang: "Wer einen Menschen mit Parkinson begleitet, sieht oft, wie schwer manche Bewegungen fallen. Physiotherapie im Hausbesuch kann helfen, Strategien für den Alltag zu finden, die wirklich zu Hause funktionieren."
      },
      body: {
        "Typische Herausforderungen im Alltag": ["Häufig sind kleine, schlurfende Schritte, plötzliches Stocken beim Gehen, Unsicherheit beim Umdrehen und Mühe beim Aufstehen. Das kann von Tag zu Tag unterschiedlich sein."],
        "Was im Hausbesuch geübt wird": ["Wir arbeiten an großen, bewussten Bewegungen, am Gleichgewicht und an Strategien gegen das Stocken, etwa mit Rhythmus oder Markierungen am Boden. Geübt wird in Ihrer Wohnung, wo die Hindernisse wirklich sind."],
        "Tipps für zu Hause": ["<ul><li>Laut mitzählen oder Musik nutzen, um in den Gehrhythmus zu kommen</li><li>Wege frei halten und gut beleuchten</li><li>Drehungen in großen Bögen statt auf der Stelle</li></ul>"],
        "Hausbesuch anfragen": ["Wir kommen zu Ihnen {ort}. Angehörige sind beim Termin herzlich willkommen."]
      },
      faq: [["Wie oft ist Physiotherapie bei Parkinson sinnvoll?", "Das hängt vom Verlauf ab und wird ärztlich verordnet. Regelmäßigkeit ist meist wichtiger als die einzelne Einheit."], ["Können Angehörige mitüben?", "Ja, sehr gern. Wir zeigen, wie Sie im Alltag unterstützen können."]],
      check: ["Freie Laufwege", "Markierungen an Engstellen", "Feste Schuhe", "Sitzgelegenheit im Flur"]
    },
    {
      id: "schlaganfall", title: "Nach dem Schlaganfall: wieder mobil im eigenen Zuhause", kw: "physiotherapie nach schlaganfall zu hause", vol: 110, rank: null, season: [],
      img: "leistung-alltagstraining", page: ["/alltagstraining-hausbesuch", "Alltagstraining im Hausbesuch"], link2: ["/gangschule-hausbesuch", "Gangschule"],
      also: ["schlaganfall übungen zu hause", "halbseitenlähmung physiotherapie", "schlaganfall reha zu hause"], intent: "Orientierung nach der Reha", match: /schlaganfall/i,
      intro: {
        sie: "Nach einem Schlaganfall ist der Weg zurück in den Alltag oft lang. Physiotherapie im Hausbesuch kann helfen, die in der Reha begonnene Arbeit im eigenen Zuhause fortzusetzen.",
        ang: "Wenn ein Angehöriger nach einem Schlaganfall nach Hause kommt, verändert sich vieles. Physiotherapie im Hausbesuch kann helfen, Bewegungen im Alltag wieder sicherer zu machen und Angehörige einzubinden."
      },
      body: {
        "Warum das gewohnte Umfeld wichtig ist": ["In der eigenen Wohnung zeigt sich, welche Bewegungen im Alltag wirklich gebraucht werden. Wir üben genau dort: am Bett, im Bad, in der Küche."],
        "Was trainiert wird": ["Je nach Situation arbeiten wir an Gleichgewicht, Gehen, Arm- und Handfunktion sowie an sicheren Bewegungsübergängen. Ziel ist mehr Selbstständigkeit im Alltag."],
        "Wie Angehörige unterstützen können": ["Angehörige lernen, wann Hilfe sinnvoll ist und wann es besser ist, Zeit zu lassen. So entsteht im Alltag mehr Übung, ohne zu überfordern."],
        "Hausbesuch anfragen": ["Wir kommen zu Ihnen {ort}. Für Privatpatienten, Beihilfeberechtigte und Selbstzahler."]
      },
      faq: [["Wann sollte die Therapie zu Hause beginnen?", "Am besten ohne lange Pause nach Klinik oder Reha. Sprechen Sie frühzeitig mit Ihrer Ärztin oder Ihrem Arzt über die Verordnung."], ["Wie lange dauert ein Termin?", "Bei uns 60 Minuten, damit genug Zeit für Übungen und Anleitung bleibt."]],
      check: ["Hilfsmittel griffbereit", "Sicherer Platz zum Üben", "Haltegriffe im Bad"]
    },
    {
      id: "kosten", title: "Wer zahlt Physiotherapie zu Hause? Privat, Beihilfe und Selbstzahler", kw: "physiotherapie hausbesuch kosten", vol: 260, rank: 15, season: [],
      img: "hero-hausbesuch", page: ["/", "Mobile Physiotherapie Oehlke"], link2: ["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"],
      also: ["hausbesuch physiotherapie privat", "beihilfe physiotherapie hausbesuch", "physiotherapie selbstzahler preise"], intent: "Kosten und Erstattung verstehen",
      intro: {
        sie: "Physiotherapie im Hausbesuch ist bequem, doch viele fragen sich: Was kostet das, und wer übernimmt es? Hier finden Sie einen Überblick für Privatversicherte, Beihilfeberechtigte und Selbstzahler.",
        ang: "Wenn Eltern Physiotherapie zu Hause brauchen, stellt sich schnell die Kostenfrage. Hier finden Sie einen Überblick, damit Sie gut vorbereitet sind."
      },
      body: {
        "Privatversicherte": ["Private Krankenversicherungen erstatten Physiotherapie meist nach ärztlicher Verordnung. Wie viel erstattet wird, hängt vom Tarif ab. Ein kurzer Anruf bei der Versicherung vor dem Start schafft Klarheit."],
        "Beihilfeberechtigte": ["Die Beihilfe erstattet Heilmittel bis zu festgelegten Höchstbeträgen, auch für den Hausbesuch und das Wegegeld. Der Rest kann über eine ergänzende private Versicherung abgedeckt sein."],
        "Selbstzahler": ["Auch ohne Verordnung können Sie Physiotherapie als Selbstzahler in Anspruch nehmen. Die Preise erhalten Sie vorab schriftlich."],
        "Was auf der Verordnung stehen sollte": ["Wichtig sind das Heilmittel, die Anzahl der Behandlungen, die Diagnose und der Vermerk Hausbesuch. Fehlt der Vermerk, kann die Erstattung für den Hausbesuch wegfallen."],
        "Transparente Preise": ["Vor dem ersten Termin erhalten Sie von uns eine Preisinformation. So wissen Sie genau, welche Kosten entstehen können. Wir kommen zu Ihnen {ort}."]
      },
      faq: [["Erstattet die Versicherung den vollen Betrag?", "Nicht immer. Erstattungen hängen vom Tarif bzw. den Beihilfevorschriften ab. Fragen Sie im Zweifel vorher nach."], ["Was kostet ein Termin?", "Unsere aktuellen Preise nennen wir Ihnen gern vorab, am Telefon oder schriftlich."]],
      check: ["Verordnung mit Vermerk Hausbesuch", "Tarif bei der Versicherung prüfen", "Preisinformation vorab geben lassen"]
    },
    {
      id: "angehoerige", title: "Tipps für Angehörige: Bewegung im Alltag gut begleiten", kw: "angehörige pflege bewegung tipps", vol: 90, rank: null, season: [],
      img: "geriatrie", page: ["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"], link2: ["/alltagstraining-hausbesuch", "Alltagstraining"],
      also: ["eltern im alter unterstützen", "mobilität senioren fördern", "pflegende angehörige bewegung"], intent: "Praktische Tipps",
      intro: {
        sie: "Bewegung ist im Alter wertvoll, doch im Alltag fehlt oft die Anleitung. Diese Tipps helfen, Bewegung sicher und mit Freude einzubauen.",
        ang: "Als Angehörige möchten Sie helfen, ohne zu viel abzunehmen. Diese Tipps zeigen, wie Sie Bewegung im Alltag sicher begleiten können."
      },
      body: {
        "Selbstständigkeit fördern statt abnehmen": ["Oft ist es schneller, Dinge selbst zu erledigen. Wer aber Zeit lässt und nur so viel hilft wie nötig, unterstützt die Selbstständigkeit am meisten."],
        "Kleine Bewegungen, große Wirkung": ["Aufstehen ohne Hände, ein Spaziergang zum Briefkasten oder Treppensteigen mit Geländer: Viele Alltagswege sind bereits Training."],
        "Auf sich selbst achten": ["Begleitung kostet Kraft. Rückenschonendes Helfen beim Aufstehen und Umsetzen lässt sich lernen. Wir zeigen gern, wie es geht."],
        "Unterstützung durch Physiotherapie": ["Im Hausbesuch beziehen wir Angehörige auf Wunsch aktiv ein. Wir kommen zu Ihnen {ort}."]
      },
      faq: [["Darf ich beim Termin dabei sein?", "Ja, sehr gern. Oft ist das sogar hilfreich."], ["Wie erkenne ich, dass Hilfe nötig ist?", "Hinweise sind zum Beispiel Unsicherheit beim Gehen, Stürze oder Angst vor Bewegung. Sprechen Sie uns an."]],
      check: ["Zeit lassen beim Aufstehen", "Wege frei halten", "Pausen einplanen"]
    },
    {
      id: "lymph", title: "Lymphdrainage im Hausbesuch: Ablauf, Tipps und Fragen", kw: "lymphdrainage hausbesuch", vol: 140, rank: 7, season: [6, 7, 8],
      img: "leistung-lymphdrainage", page: ["/lymphdrainage-hausbesuch", "Lymphdrainage im Hausbesuch"], link2: ["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"],
      also: ["manuelle lymphdrainage zu hause", "lymphödem bein", "lymphdrainage ablauf"], intent: "Ablauf verstehen", match: /lymph/i,
      intro: {
        sie: "Geschwollene Beine oder Arme können den Alltag belasten. Die manuelle Lymphdrainage ist eine sanfte Grifftechnik, die den Abtransport von Gewebeflüssigkeit fördern soll, im Hausbesuch ganz ohne Anfahrt.",
        ang: "Wenn Angehörige mit Schwellungen zu kämpfen haben, ist der Weg zur Praxis oft beschwerlich. Lymphdrainage im Hausbesuch kann eine Entlastung sein."
      },
      body: {
        "Was ist manuelle Lymphdrainage?": ["Eine sanfte Grifftechnik mit kreisenden, pumpenden Bewegungen. Sie wird häufig bei Lymphödemen oder nach Operationen ärztlich verordnet."],
        "So läuft ein Termin ab": ["Sie liegen bequem, im Bett oder auf einer Liege. Die Behandlung ist ruhig und in der Regel angenehm. Danach wird oft eine Kompression angelegt, wenn sie verordnet ist."],
        "Was Sie selbst tun können": ["Regelmäßige Bewegung, ausreichend trinken und die Kompression nach Anleitung tragen. Wir zeigen Ihnen passende Übungen."],
        "Hausbesuch anfragen": ["Wir kommen zu Ihnen {ort}. Für Privatpatienten, Beihilfeberechtigte und Selbstzahler."]
      },
      faq: [["Wie lange dauert eine Behandlung?", "Je nach Verordnung 30 bis 60 Minuten. Bei uns sind Termine auf 60 Minuten ausgelegt."], ["Ist Lymphdrainage auch im Sommer sinnvoll?", "Gerade bei Wärme nehmen Schwellungen oft zu. Sprechen Sie mit Ihrer Ärztin oder Ihrem Arzt."]],
      check: ["Kompression griffbereit", "Bequeme Liegemöglichkeit", "Ausreichend trinken"]
    },
    {
      id: "kg", title: "Krankengymnastik zu Hause: für wen sich der Hausbesuch lohnt", kw: "krankengymnastik hausbesuch", vol: 320, rank: 12, season: [],
      img: "leistung-krankengymnastik", page: ["/krankengymnastik-hausbesuch", "Krankengymnastik im Hausbesuch"], link2: ["/gangschule-hausbesuch", "Gangschule"],
      also: ["kg hausbesuch", "physiotherapie hausbesuch verordnung", "krankengymnastik zu hause"], intent: "Entscheidungshilfe",
      intro: {
        sie: "Krankengymnastik im Hausbesuch bringt die Therapie zu Ihnen. Für wen das sinnvoll ist und wie ein Termin abläuft, erfahren Sie hier.",
        ang: "Wenn Eltern nicht mehr gut in eine Praxis kommen, kann Krankengymnastik im Hausbesuch eine Lösung sein. Hier erfahren Sie, wie das funktioniert."
      },
      body: {
        "Für wen ist der Hausbesuch gedacht?": ["Für Menschen, denen der Weg in eine Praxis schwerfällt: nach Operationen, bei Gangunsicherheit, nach einem Schlaganfall oder bei chronischen Erkrankungen."],
        "So läuft ein Termin ab": ["Wir kommen pünktlich zu Ihnen, besprechen den aktuellen Stand und üben gezielt in Ihrer Umgebung. Jeder Termin dauert bei uns 60 Minuten."],
        "Vorteile im gewohnten Umfeld": ["<ul><li>keine Anfahrt und kein Wartezimmer</li><li>Training an echten Alltagssituationen</li><li>Angehörige können dabei sein</li></ul>"],
        "Hausbesuch anfragen": ["Wir kommen zu Ihnen {ort}. Für Privatpatienten, Beihilfeberechtigte und Selbstzahler."]
      },
      faq: [["Brauche ich eine Verordnung?", "Für die Erstattung in der Regel ja, mit Vermerk Hausbesuch. Als Selbstzahler geht es auch ohne."], ["Wie schnell bekomme ich einen Termin?", "Rufen Sie an, wir prüfen, wann eine Tour in Ihrer Nähe passt."]],
      check: ["Verordnung mit Vermerk Hausbesuch", "Bequeme Kleidung", "Etwas Platz zum Üben"]
    }
  ];
})();
