import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:fieldlens_app/core/database/tables.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

part 'app_database.g.dart';

/// The app's local database: inspections and their sync outbox.
@DriftDatabase(tables: [Inspections, OutboxEntries])
class AppDatabase extends _$AppDatabase {
  /// Opens (or creates) the database file.
  AppDatabase() : super(_openConnection());

  /// Creates an in-memory database, for tests only.
  AppDatabase.forTesting(super.e);

  @override
  int get schemaVersion => 2;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) => m.createAll(),
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.addColumn(inspections, inspections.notes);
      }
    },
  );
}

LazyDatabase _openConnection() {
  return LazyDatabase(() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File(p.join(dir.path, 'fieldlens.sqlite'));
    return NativeDatabase.createInBackground(file);
  });
}
