import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Semantic roles shared by every mobile screen, including modal routes.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  final Color paper, surface, ink, muted, accent, onAccent, danger;
  const AppColors({
    required this.paper,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.accent,
    required this.onAccent,
    required this.danger,
  });
  static const light = AppColors(
    paper: Color(0xfff4f6f8),
    surface: Color(0xffffffff),
    ink: Color(0xff182b3a),
    muted: Color(0xff596b78),
    accent: Color(0xff155978),
    onAccent: Color(0xffffffff),
    danger: Color(0xffb43a35),
  );
  static const dark = AppColors(
    paper: Color(0xff0d141c),
    surface: Color(0xff172330),
    ink: Color(0xffeaf1f7),
    muted: Color(0xffa8b6c4),
    accent: Color(0xff8bcfea),
    onAccent: Color(0xff0d2430),
    danger: Color(0xffffb4ab),
  );
  Color get line => Color.alphaBlend(ink.withValues(alpha: .11), surface);
  Color get field => Color.alphaBlend(ink.withValues(alpha: .045), surface);
  Color get tint => Color.alphaBlend(accent.withValues(alpha: .09), surface);
  Color get dangerTint =>
      Color.alphaBlend(danger.withValues(alpha: .10), surface);
  @override
  AppColors copyWith({
    Color? paper,
    Color? surface,
    Color? ink,
    Color? muted,
    Color? accent,
    Color? onAccent,
    Color? danger,
  }) => AppColors(
    paper: paper ?? this.paper,
    surface: surface ?? this.surface,
    ink: ink ?? this.ink,
    muted: muted ?? this.muted,
    accent: accent ?? this.accent,
    onAccent: onAccent ?? this.onAccent,
    danger: danger ?? this.danger,
  );
  @override
  AppColors lerp(covariant AppColors? other, double t) {
    if (other == null) return this;
    return AppColors(
      paper: Color.lerp(paper, other.paper, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      accent: Color.lerp(accent, other.accent, t)!,
      onAccent: Color.lerp(onAccent, other.onAccent, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
    );
  }
}

extension CompanionAppearance on BuildContext {
  AppColors get colors =>
      Theme.of(this).extension<AppColors>() ??
      (Theme.of(this).brightness == Brightness.dark
          ? AppColors.dark
          : AppColors.light);
}

ThemeData companionTheme(Brightness brightness) {
  final p = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
  final base = ThemeData(useMaterial3: true, brightness: brightness);
  final scheme =
      ColorScheme.fromSeed(
        seedColor: p.accent,
        brightness: brightness,
      ).copyWith(
        primary: p.accent,
        onPrimary: p.onAccent,
        surface: p.surface,
        onSurface: p.ink,
        onSurfaceVariant: p.muted,
        outline: p.line,
        error: p.danger,
        primaryContainer: p.tint,
        onPrimaryContainer: p.accent,
        surfaceContainerHighest: p.field,
      );
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(14));
  return base.copyWith(
    colorScheme: scheme,
    extensions: [p],
    scaffoldBackgroundColor: p.paper,
    visualDensity: VisualDensity.standard,
    materialTapTargetSize: MaterialTapTargetSize.padded,
    textTheme: base.textTheme
        .apply(bodyColor: p.ink, displayColor: p.ink)
        .copyWith(
          headlineLarge: TextStyle(
            fontSize: 32,
            height: 1.18,
            fontWeight: FontWeight.w700,
            letterSpacing: -.8,
            color: p.ink,
          ),
          headlineMedium: TextStyle(
            fontSize: 28,
            height: 1.25,
            fontWeight: FontWeight.w700,
            letterSpacing: -.6,
            color: p.ink,
          ),
          titleLarge: TextStyle(
            fontSize: 22,
            height: 1.3,
            fontWeight: FontWeight.w600,
            color: p.ink,
          ),
          titleMedium: TextStyle(
            fontSize: 17,
            height: 1.4,
            fontWeight: FontWeight.w600,
            color: p.ink,
          ),
          bodyLarge: TextStyle(fontSize: 17, height: 1.55, color: p.ink),
          bodyMedium: TextStyle(fontSize: 16, height: 1.5, color: p.ink),
          bodySmall: TextStyle(fontSize: 13, height: 1.5, color: p.muted),
          labelLarge: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: p.ink,
          ),
          labelSmall: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: p.muted,
          ),
        ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.paper,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: p.ink,
      ),
      systemOverlayStyle: brightness == Brightness.dark
          ? SystemUiOverlayStyle.light
          : SystemUiOverlayStyle.dark,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.field,
      contentPadding: const EdgeInsets.symmetric(horizontal: 15, vertical: 15),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: p.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: p.accent, width: 1.5),
      ),
      labelStyle: TextStyle(color: p.muted),
      hintStyle: TextStyle(color: p.muted),
      helperStyle: TextStyle(fontSize: 13, color: p.muted),
      helperMaxLines: 4,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.accent,
        foregroundColor: p.onAccent,
        minimumSize: const Size(48, 48),
        shape: shape,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.accent,
        minimumSize: const Size(48, 48),
        side: BorderSide(color: p.line),
        shape: shape,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: p.accent,
        minimumSize: const Size(48, 48),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        minimumSize: const Size(48, 48),
        foregroundColor: p.muted,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      indicatorColor: p.tint,
      iconTheme: WidgetStateProperty.resolveWith(
        (s) => IconThemeData(
          size: 23,
          color: s.contains(WidgetState.selected) ? p.accent : p.muted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (s) => TextStyle(
          fontSize: 12,
          fontWeight: s.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w400,
          color: s.contains(WidgetState.selected) ? p.accent : p.muted,
        ),
      ),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: p.paper,
      indicatorColor: p.tint,
      selectedIconTheme: IconThemeData(color: p.accent),
      unselectedIconTheme: IconThemeData(color: p.muted),
      selectedLabelTextStyle: TextStyle(color: p.accent),
      unselectedLabelTextStyle: TextStyle(color: p.muted),
    ),
    dividerTheme: DividerThemeData(color: p.line, thickness: .5, space: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.muted,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
      ),
    ),
    listTileTheme: ListTileThemeData(iconColor: p.muted, textColor: p.ink),
    expansionTileTheme: ExpansionTileThemeData(
      iconColor: p.muted,
      collapsedIconColor: p.muted,
      textColor: p.ink,
      collapsedTextColor: p.ink,
      shape: const Border(),
      collapsedShape: const Border(),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: p.tint,
      labelStyle: TextStyle(color: p.accent, fontSize: 13),
      side: BorderSide.none,
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: p.ink,
      contentTextStyle: TextStyle(color: p.surface, fontSize: 15),
      behavior: SnackBarBehavior.floating,
      shape: shape,
    ),
  );
}

class PageIntro extends StatelessWidget {
  final String title, subtitle;
  const PageIntro(this.title, this.subtitle, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8, bottom: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineLarge),
        const SizedBox(height: 9),
        Text(
          subtitle,
          style: TextStyle(
            color: context.colors.muted,
            fontSize: 15,
            height: 1.6,
          ),
        ),
      ],
    ),
  );
}
