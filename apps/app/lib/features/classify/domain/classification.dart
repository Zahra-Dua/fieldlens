/// What the model says about one photo.
class Classification {
  /// Creates the prediction result.
  const Classification({
    required this.label,
    required this.confidence,
    required this.scores,
  });

  /// Winning class, e.g. "METAL".
  final String label;

  /// Probability of [label], 0 to 1.
  final double confidence;

  /// Probability for every class, in [kClassLabels] order.
  final List<double> scores;
}

/// Predictions below this probability are shown as uncertain.
const kConfidenceThreshold = 0.6;

/// Alphabetical, the same order the model was trained with (see model_card.md).
const kClassLabels = ['GLASS', 'METAL', 'ORGANIC', 'PAPER', 'PLASTIC'];
