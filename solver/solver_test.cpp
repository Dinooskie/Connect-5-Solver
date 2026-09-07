#include "solver.hpp"

#include <cassert>

using connect5::Position;
using connect5::Result;
using connect5::Solver;

int main() {
  auto winning = Position::from_moves("19293949");
  assert(winning);
  Solver solver;
  assert(solver.solve(*winning) == Result::win);

  auto full = Position::from_moves("111111122222223333333444444455555556666666777777788888889999999");
  assert(!full);

  Solver limited(1);
  Position empty;
  assert(!limited.solve(empty));
}
