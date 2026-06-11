package io.foxbiz.shellular.utils;

/**
 * Utility class for path operations
 */
public class Path {
    private static final String SEPARATOR = "/";

    /**
     * Joins multiple path segments into a single path
     * @param paths Path segments to join
     * @return Combined path, or empty string if no paths provided
     */
    public static String join(String... paths) {
        if (paths == null || paths.length == 0) {
            return "";
        }

        StringBuilder joinedPath = new StringBuilder();
        boolean firstSegment = true;

        for (String path : paths) {
            // Skip null or empty path segments
            if (path == null || path.isEmpty()) {
                continue;
            }

            String normalizedPath = path;

            // For non-first segments, ensure we have exactly one separator between segments
            if (!firstSegment) {
                if (!joinedPath.toString().endsWith(SEPARATOR) && !normalizedPath.startsWith(SEPARATOR)) {
                    joinedPath.append(SEPARATOR);
                } else if (joinedPath.toString().endsWith(SEPARATOR) && normalizedPath.startsWith(SEPARATOR)) {
                    normalizedPath = normalizedPath.substring(1);
                }
            } else {
                firstSegment = false;
            }

            joinedPath.append(normalizedPath);
        }

        // Remove trailing separator if present
        String result = joinedPath.toString();
        if (result.endsWith(SEPARATOR) && result.length() > 1) {
            result = result.substring(0, result.length() - 1);
        }

        return result;
    }

    /**
     * Resolves a path by ensuring proper separator usage
     * @param paths Path segments to resolve
     * @return Resolved path
     */
    public static String resolve(String... paths) {
        if (paths == null || paths.length == 0) {
            return "";
        }

        StringBuilder resolvedPath = new StringBuilder();

        for (String path : paths) {
            if (path == null || path.isEmpty()) {
                continue;
            }

            if (path.startsWith(SEPARATOR)) {
                resolvedPath.append(path);
            } else {
                resolvedPath.append(SEPARATOR).append(path);
            }
        }

        // Normalize by removing duplicate separators
        String result = resolvedPath.toString();
        while (result.contains("//")) {
            result = result.replace("//", "/");
        }

        return result;
    }
}