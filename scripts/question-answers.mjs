/* Respuestas sugeridas para el modo «Responder». Las que vienen en el documento
 * se conservan; el resto se generan aquí de forma local y se marcan como
 * "generada" para distinguirlas del material verificado. */

const TO_BE = {
    I: "am", you: "are", he: "is", she: "is", it: "is", we: "are", they: "are"
};
const TO_BE_PAST = {
    I: "was", you: "were", he: "was", she: "was", it: "was", we: "were", they: "were"
};
const TO_HAVE = {
    I: "have", you: "have", he: "has", she: "has", it: "has", we: "have", they: "have"
};
const TO_DO = {
    I: "do", you: "do", he: "does", she: "does", it: "does", we: "do", they: "do"
};

function subjectOf(text) {
    const match = String(text).match(/\b(i|you|he|she|it|we|they)\b/i);
    if (!match) return "I";
    const word = match[1].toLowerCase();
    return word === "you" || word === "i" ? "I" : word;
}

function auxiliaryOf(text) {
    const normalized = String(text).trim().toLowerCase().replace(
        /^(don't|doesn't|didn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|can't|couldn't|won't|wouldn't|shouldn't)\b/,
        value => value.replace("n't", "")
    );
    const match = normalized.match(/^(do|does|did|am|is|are|was|were|have|has|had|will|would|can|could|should|may|might|must|shall)\b/);
    return match ? match[1] : "";
}

function choiceAnswer(english) {
    const match = String(english).match(/\b(.+?)\s+or\s+(.+?)\?$/i);
    if (!match) return "Either one is fine.";
    const first = match[1].replace(/^.*\b(do|does|did|is|are|was|were|will|would|can|could)\s+(you|he|she|it|we|they|i)\s+/i, "").trim();
    return first ? `${first.charAt(0).toUpperCase()}${first.slice(1)}.` : "Either one is fine.";
}

function yesNoAnswer(question) {
    if (question.type === "tag") return "Yes, that's right.";
    if (question.type === "eleccion") return choiceAnswer(question.english);
    if (question.type === "retorica") return "Obviously.";
    const subject = subjectOf(question.english);
    const auxiliary = auxiliaryOf(question.english);
    if (!auxiliary) return "Yes, I think so.";
    if (auxiliary === "do" || auxiliary === "does") return `Yes, ${subject} ${TO_DO[subject]}.`;
    if (auxiliary === "am" || auxiliary === "is" || auxiliary === "are") return `Yes, ${subject} ${TO_BE[subject]}.`;
    if (auxiliary === "was" || auxiliary === "were") return `Yes, ${subject} ${TO_BE_PAST[subject]}.`;
    if (auxiliary === "have" || auxiliary === "has") return `Yes, ${subject} ${TO_HAVE[subject]}.`;
    return `Yes, ${subject} ${auxiliary}.`;
}

function whatAnswer(text) {
    if (/\bwhat time\b/.test(text)) return "It is five o'clock.";
    if (/\bwhat day\b/.test(text)) return "It is Monday.";
    if (/\bwhat date\b/.test(text)) return "It is the fifth of May.";
    if (/\bwhat color\b/.test(text)) return "It is blue.";
    if (/\bwhat size\b/.test(text)) return "It is medium.";
    if (/\bwhat kind of\b|\bwhat type of\b/.test(text)) return "It is a book about animals.";
    if (/\bwhat(\s+are\s+you\s+doing|\s+will\s+you\s+do\s+tonight)\b/.test(text)) return "I am studying.";
    if (/\bwhat do you do\b/.test(text)) return "I am a teacher.";
    if (/\bwhat do you (want|need)\b/.test(text)) return "I want a new book.";
    if (/\bwhat did you (say|ask)\b/.test(text)) return "I said hello.";
    if (/\bwhat happened\b/.test(text)) return "Something unexpected happened.";
    if (/\bwhat will happen\b/.test(text)) return "Something good will happen.";
    if (/\bwhat are you looking for\b/.test(text)) return "I am looking for my keys.";
    if (/\bwhat are you thinking about\b/.test(text)) return "I am thinking about the future.";
    if (/\bwhat are you waiting for\b/.test(text)) return "I am waiting for a friend.";
    return "Something.";
}

function howAnswer(text) {
    if (/\bhow are you\b/.test(text)) return "I am fine, thanks.";
    if (/\bhow do you feel\b|\bhow are you feeling\b/.test(text)) return "I feel fine.";
    if (/\bhow did you know\b/.test(text)) return "I guessed.";
    if (/\bhow do you do it\b|\bhow did you do it\b/.test(text)) return "You mix it carefully.";
    if (/\bhow much\b/.test(text)) {
        if (/\bcost\b|\bprice\b/.test(text)) return "It costs ten dollars.";
        if (/\bneed\b/.test(text)) return "I need two bottles.";
        if (/\bhave\b/.test(text)) return "I have two.";
        return "A little.";
    }
    if (/\bhow many\b/.test(text)) {
        if (/\bbuy\b|\bbought\b/.test(text)) return "I bought ten.";
        if (/\bpeople\b/.test(text)) return "There are ten people.";
        return "Ten.";
    }
    if (/\bhow long\b/.test(text)) return "For two hours.";
    if (/\bhow often\b/.test(text)) return "Three times a week.";
    if (/\bhow far\b/.test(text)) return "It is two kilometers away.";
    if (/\bhow old\b/.test(text)) return "I am thirty years old.";
    if (/\bhow fast\b/.test(text)) return "About sixty kilometers per hour.";
    if (/\bhow tall\b/.test(text)) return "About one meter eighty.";
    if (/\bhow high\b/.test(text)) return "About twenty meters high.";
    if (/\bhow deep\b/.test(text)) return "About two meters deep.";
    if (/\bhow wide\b|\bhow big\b/.test(text)) return "About three meters wide.";
    if (/\bhow well\b/.test(text)) return "Very well, thank you.";
    if (/\bhow (quickly|soon)\b/.test(text)) return "In ten minutes.";
    if (/\bhow come\b/.test(text)) return "Because I changed my mind.";
    return "Like this.";
}

function whAnswer(question) {
    const text = question.english.toLowerCase();
    const word = question.questionWord;
    let answer;
    if (word.startsWith("how")) answer = howAnswer(text);
    else if (word === "where") answer = /\bwent\b|\bgo\b/.test(text) ? "To the park." : "At home.";
    else if (word === "when") answer = /\bdid\b|\bwas\b|\bwere\b|\bhad\b|\bmet\b/.test(text) ? "Yesterday." : "Tomorrow.";
    else if (word === "why") answer = "Because I wanted to.";
    else if (word === "who") answer = /\b(is|was|are|were)\b/.test(text) ? "It is my friend." : "My friend did.";
    else if (word === "whose") answer = "It is mine.";
    else if (word === "which") answer = /\bgoes to\b|\bwent to\b/.test(text) ? "The one to Paris." : "The blue one.";
    else answer = whatAnswer(text);
    if (/\bwhat time\b/.test(text) && /\bwas\b/.test(text)) return "It was five o'clock.";
    return answer;
}

function embeddedAnswer(question) {
    if (question.related) return yesNoOrWhFromText(question.related);
    const text = String(question.english);
    const conditional = text.match(/\b(if|whether)\b(.+)/i);
    if (conditional) return "I think so.";
    const clause = text.match(/\b(what time|how much|how many|how long|how often|how far|how old|what|who|whom|whose|which|where|when|why|how)\b(.+)/i);
    if (!clause) return "I am not sure.";
    const word = clause[1].toLowerCase();
    const rest = word + clause[2];
    if (word.startsWith("how")) return howAnswer(rest);
    if (word === "where") return /\bwent\b/.test(rest) ? "To the park." : "At home.";
    if (word === "when") return /\bwas\b|\bwere\b|\bhad\b|\bmet\b|\bwent\b/.test(rest) ? "Yesterday." : "Tomorrow.";
    if (word === "why") return "Because of that.";
    if (word === "who" || word === "whom") return "Someone.";
    if (word === "whose") return "It is mine.";
    if (word === "which") return /\bgoes to\b|\bwent to\b/.test(rest) ? "The one to Paris." : "The blue one.";
    if (/\bwhat time\b/.test(rest) && /\bwas\b/.test(rest)) return "It was five o'clock.";
    return whatAnswer(rest);
}

function yesNoOrWhFromText(english) {
    const fake = {
        english,
        questionWord: /^(what|who|whose|which|where|when|why|how)\b/i.test(english)
            ? english.match(/^(what|who|whose|which|where|when|why|how)\b/i)[1].toLowerCase()
            : "yes-no",
        type: "yes-no"
    };
    return fake.questionWord === "yes-no" ? yesNoAnswer(fake) : whAnswer(fake);
}

export function generateAnswer(question) {
    if (question.section === "incorporadas" || question.type === "indirecta") return embeddedAnswer(question);
    const isYesNo = ["yes-no", "tag", "negativa", "eleccion", "confirmacion", "retorica", "eco"]
        .includes(question.type) || question.questionWord === "yes-no" || question.questionWord === "confirmation";
    return isYesNo ? yesNoAnswer(question) : whAnswer(question);
}

export function fillMissingAnswers(questions) {
    return questions.map(question => {
        if (question.answerGuide) {
            return { ...question, answerSource: question.answerSource || "documento" };
        }
        const answer = generateAnswer(question).trim();
        return {
            ...question,
            answerGuide: answer || "I am not sure.",
            answerSource: "generada"
        };
    });
}
