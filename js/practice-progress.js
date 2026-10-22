const TABLE = "vocabulary_practice_progress"

export function createPracticeProgressSync(supabase, userId) {
    if (!supabase || !userId) throw new Error("Supabase and a signed-in user are required.")

    return {
        async loadAndMerge(localProgress) {
            const { data, error } = await supabase
                .from(TABLE)
                .select("item_id,attempts,correct,repetitions,interval_days,ease,due_at,lapses,last_reviewed_at")
                .eq("user_id", userId)
            if (error) throw error

            const merged = { ...localProgress }
            const cloudById = new Map((data || []).map(row => [row.item_id, fromDatabase(row)]))
            const pendingWrites = []

            for (const [itemId, cloudProgress] of cloudById) {
                const local = localProgress[itemId]
                if (!local || getLastReviewedAt(local) <= getLastReviewedAt(cloudProgress)) {
                    merged[itemId] = cloudProgress
                } else {
                    pendingWrites.push(toDatabase(userId, itemId, local))
                }
            }

            for (const [itemId, local] of Object.entries(localProgress)) {
                if (!cloudById.has(itemId)) pendingWrites.push(toDatabase(userId, itemId, local))
            }

            if (pendingWrites.length) {
                const { error: mergeError } = await supabase.from(TABLE).upsert(pendingWrites, { onConflict: "user_id,item_id" })
                if (mergeError) throw mergeError
            }
            return merged
        },

        async save(itemId, progress) {
            const { error } = await supabase.from(TABLE).upsert(
                toDatabase(userId, itemId, progress),
                { onConflict: "user_id,item_id" }
            )
            if (error) throw error
        }
    }
}

function fromDatabase(row) {
    return {
        attempts: row.attempts,
        correct: row.correct,
        repetitions: row.repetitions,
        intervalDays: Number(row.interval_days),
        ease: Number(row.ease),
        dueAt: row.due_at ? new Date(row.due_at).getTime() : 0,
        lapses: row.lapses,
        lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : 0
    }
}

function toDatabase(userId, itemId, progress) {
    return {
        user_id: userId,
        item_id: itemId,
        attempts: progress.attempts || 0,
        correct: progress.correct || 0,
        repetitions: progress.repetitions || 0,
        interval_days: progress.intervalDays || 0,
        ease: progress.ease || 2.5,
        due_at: new Date(progress.dueAt || 0).toISOString(),
        lapses: progress.lapses || 0,
        last_reviewed_at: progress.lastReviewedAt ? new Date(progress.lastReviewedAt).toISOString() : null
    }
}

function getLastReviewedAt(progress) {
    const value = progress.lastReviewedAt || 0
    const timestamp = typeof value === "number" ? value : new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
}
