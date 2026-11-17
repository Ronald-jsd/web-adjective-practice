/**
 * Resuelve el id con el que debe guardarse una lección de Shadowing.
 * Evita crear una segunda lección cuando el video ya está en la biblioteca.
 */
export function resolveSavedLessonId(current, lessons = []) {
    if (current?.id && lessons.some(lesson => lesson.id === current.id)) return current.id
    const videoId = current?.videoId
    if (!videoId) return ""
    const sameVideo = lessons.find(lesson =>
        lesson.videoId === videoId && lesson.transcript?.length
    )
    return sameVideo?.id || ""
}
