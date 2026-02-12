import fs from 'fs/promises';
import path from 'path';
import {glob} from 'glob';

export const sleep = (time: number) =>
    new Promise(resolve => setTimeout(resolve, time));

export type ComponentInCode = {
    name: string;
    source: string;
    fileMask: string;
};

/**
 * Resolves translation components from the filesystem
 * Supports both direct paths and glob patterns
 *
 * @param keysetsPath - Path or glob pattern (e.g., "projects/*\/src/i18n-keysets")
 * @param mainLanguage - Main language code (e.g., "en")
 * @returns Array of components found
 */
export const resolveComponents = async (
    keysetsPath: string,
    mainLanguage: string,
): Promise<ComponentInCode[]> => {
    const components: ComponentInCode[] = [];

    // Проверяем, является ли путь глоб-паттерном
    const isGlobPattern =
        keysetsPath.includes('*') ||
        keysetsPath.includes('?') ||
        keysetsPath.includes('[');

    if (isGlobPattern) {
        console.log(`🔍 Glob pattern detected: ${keysetsPath}`);

        // Находим все директории, соответствующие паттерну
        const matchedDirs = await glob(keysetsPath, {
            cwd: process.cwd(),
            absolute: false,
            ignore: ['**/node_modules/**', '**/.git/**'],
        });

        console.log(
            `📁 Found ${matchedDirs.length} directories matching pattern`,
        );

        // Обрабатываем каждую найденную директорию
        for (const dir of matchedDirs) {
            try {
                const resolvedPath = path.resolve(process.cwd(), dir);
                const dirents = await fs.readdir(resolvedPath, {
                    withFileTypes: true,
                });

                // Извлекаем имя родительской директории для префикса
                // Например: projects/project-a/src/i18n-keysets -> project-a
                const pathParts = dir.split(path.sep);
                const parentDirName =
                    pathParts[pathParts.length - 2] ||
                    path.basename(path.dirname(dir));

                const dirComponents = dirents
                    .filter(
                        dirent =>
                            dirent.isDirectory() &&
                            !dirent.name.startsWith('.'),
                    )
                    .map(({name}) => ({
                        // Добавляем префикс из родительской директории для уникальности
                        name: `${parentDirName}_${name}`,
                        source: path.join(dir, name, `${mainLanguage}.json`),
                        fileMask: path.join(dir, name, '*.json'),
                    }));

                components.push(...dirComponents);
                console.log(
                    `  ✅ ${dir}: found ${dirComponents.length} component(s)`,
                );
            } catch (error) {
                console.warn(`  ⚠️ Failed to read directory ${dir}:`, error);
            }
        }

        console.log(`✨ Total components found: ${components.length}`);
    } else {
        // Оригинальная логика для конкретного пути
        console.log(`📂 Direct path: ${keysetsPath}`);

        const resolvedPath = path.resolve(process.cwd(), keysetsPath);
        const dirents = await fs.readdir(resolvedPath, {
            withFileTypes: true,
        });

        components.push(
            ...dirents
                .filter(
                    dirent =>
                        dirent.isDirectory() && !dirent.name.startsWith('.'),
                )
                .map(({name}) => ({
                    name,
                    source: path.join(
                        keysetsPath,
                        name,
                        `${mainLanguage}.json`,
                    ),
                    fileMask: path.join(keysetsPath, name, '*.json'),
                })),
        );

        console.log(
            `✅ Found ${components.length} component(s) in ${keysetsPath}`,
        );
    }

    return components;
};
