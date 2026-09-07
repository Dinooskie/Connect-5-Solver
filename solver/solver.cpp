#include "solver.hpp"

#include <functional>

namespace connect5 {

namespace {
std::uint64_t fold(Bits value) {
  return static_cast<std::uint64_t>(value) ^ static_cast<std::uint64_t>(value >> 64);
}
}

std::size_t KeyHash::operator()(const Key& key) const {
  std::uint64_t current = fold(key.current);
  std::uint64_t occupied = fold(key.occupied);
  return std::hash<std::uint64_t>{}(current ^ (occupied + 0x9e3779b97f4a7c15ULL + (current << 6) + (current >> 2)));
}

Solver::Solver(std::uint64_t node_limit) : node_limit_(node_limit) {}

std::optional<Result> Solver::solve(const Position& position) {
  stats_ = {};
  table_.clear();
  if (position.won(0) || position.won(1)) return Result::loss;
  return negamax(position);
}

SearchStats Solver::stats() const {
  return stats_;
}

std::optional<Result> Solver::negamax(const Position& position) {
  if (node_limit_ && stats_.nodes >= node_limit_) return std::nullopt;
  ++stats_.nodes;
  if (position.full()) return Result::draw;

  Key key = position.key();
  if (auto found = table_.find(key); found != table_.end()) {
    ++stats_.hits;
    return found->second;
  }

  bool can_draw = false;
  for (int move : position.legal_moves()) {
    Position child = position;
    if (!child.play(move)) continue;
    if (child.won(position.turn)) {
      table_[key] = Result::win;
      return Result::win;
    }
    auto child_result = negamax(child);
    if (!child_result) return std::nullopt;
    if (*child_result == Result::loss) {
      table_[key] = Result::win;
      return Result::win;
    }
    if (*child_result == Result::draw) can_draw = true;
  }

  Result result = can_draw ? Result::draw : Result::loss;
  table_[key] = result;
  return result;
}

}
